import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { streamText, generateText } from "ai";
import { randomUUID } from "crypto";
import { AppError } from "../../errors/AppError";
import { ErrorCodes } from "../../errors/error-codes";
import { prisma } from "../../lib/prisma";
import { logger } from "../../lib/logger";
import { deductUsage } from "../billing/billing.service";
import { assertHasBalance } from "../agent/ai-router.service";
import { getProviderModel } from "../agent/provider-registry";
import { checkAnomalies } from "../anomaly/anomaly.service";
import { openAiCompatRequestSchema } from "./openai-compat.schema";
import { runBenchmark } from "./openai-compat.benchmark";
import { runConsensus } from "./openai-compat.consensus";
import { splitSystemMessages } from "./openai-compat.utils";
import type { ResolvedModel } from "./openai-compat.types";
import { estimateRequestCost } from "./openai-compat.dry-run";
import {
  getCheapestModels,
  selectModelForBudget,
} from "./openai-compat.budget-router";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function openAiError(
  res: Response,
  status: number,
  message: string,
  code: string,
) {
  res.status(status).json({
    error: { message, type: "invalid_request_error", code },
  });
}

type ModelMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

async function resolveModel(modelSlug: string): Promise<ResolvedModel | null> {
  const pricing = await prisma.modelPricing.findFirst({
    where: {
      aiModel: { modelName: modelSlug, isActive: true },
      effectiveTo: null,
    },
    include: { aiModel: { include: { aiProvider: true } } },
  });

  if (!pricing) return null;

  return {
    pricingId: pricing.id,
    modelName: pricing.aiModel.modelName,
    providerName: pricing.aiModel.aiProvider.name,
    inputPricePerM: pricing.inputPricePerM.toString(),
    outputPricePerM: pricing.outputPricePerM.toString(),
  };
}

// ─── Post-request Side Effects ────────────────────────────────────────────────

// Fire-and-forget — never awaited in request path
function triggerPostRequestEffects(input: {
  userId: string;
  network: string;
  apiKeyId: string;
  costUsdc: string;
  balanceAfter: string;
}): void {
  const { userId, network, apiKeyId, costUsdc, balanceAfter } = input;
  // Anomaly detection
  checkAnomalies({
    apiKeyId,
    userId,
    network: network as never,
    costUsdc,
  }).catch((err) => logger.warn({ err }, "Anomaly check failed"));
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

/**
 * POST /v1/chat/completions
 *
 * OpenAI-compatible endpoint supporting:
 * — Standard streaming + non-streaming chat
 * — Budget-aware routing
 * — Dry run cost estimation
 * — Multi-model benchmarking
 * — Multi-model consensus
 *
 * NOT wrapped in asyncHandler — streaming responses write directly to
 * the socket. All error paths are handled explicitly.
 */
export async function openAiCompatHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { userId, network, apiKeyId } = req.apiKeyContext!;

  // ── Validation ──────────────────────────────────────────────────────────
  const parsed = openAiCompatRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    openAiError(
      res,
      StatusCodes.BAD_REQUEST,
      parsed.error.issues[0].message,
      ErrorCodes.VALIDATION_ERROR,
    );
    return;
  }

  const {
    model: modelSlug,
    messages,
    stream,
    temperature,
    max_tokens,
    budget_usdc,
    quality,
    dry_run,
    benchmark,
    benchmark_models,
    consensus,
    consensus_models,
    consensus_strategy,
  } = parsed.data;

  const { instructions, messages: aiMessages } = splitSystemMessages(
    messages as ModelMessage[],
  );

  const completionId = `chatcmpl-${randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);

  // ── Feature 7: Dry Run ──────────────────────────────────────────────────
  if (dry_run) {
    try {
      const estimate = await estimateRequestCost(modelSlug, messages);
      res.status(StatusCodes.OK).json({
        id: completionId,
        object: "chat.completion.dry_run",
        created,
        ...estimate,
      });
    } catch (err) {
      if (err instanceof AppError) {
        openAiError(res, err.status, err.message, err.code);
      } else {
        openAiError(
          res,
          500,
          "Dry run failed",
          ErrorCodes.INTERNAL_SERVER_ERROR,
        );
      }
    }
    return;
  }

  // ── Balance Check ───────────────────────────────────────────────────────
  try {
    await assertHasBalance(userId, network);
  } catch (err) {
    if (err instanceof AppError) {
      openAiError(res, err.status, err.message, err.code);
    } else {
      openAiError(
        res,
        402,
        "Balance check failed",
        ErrorCodes.INTERNAL_SERVER_ERROR,
      );
    }
    return;
  }

  // ── Feature 8: Benchmark ────────────────────────────────────────────────
  if (benchmark && benchmark_models) {
    try {
      const result = await runBenchmark({
        models: benchmark_models,
        messages: messages as ModelMessage[],
        userId,
        network,
        apiKeyId,
        temperature,
        maxTokens: max_tokens,
      });

      res.status(StatusCodes.OK).json({
        id: completionId,
        object: "chat.completion.benchmark",
        created,
        ...result,
      });
    } catch (err) {
      if (err instanceof AppError) {
        openAiError(res, err.status, err.message, err.code);
      } else {
        openAiError(
          res,
          500,
          "Benchmark failed",
          ErrorCodes.INTERNAL_SERVER_ERROR,
        );
      }
    }
    return;
  }

  // ── Feature 11: Consensus ───────────────────────────────────────────────
  if (consensus && consensus_models) {
    try {
      const result = await runConsensus({
        models: consensus_models,
        messages: messages as ModelMessage[],
        strategy: consensus_strategy,
        userId,
        network,
        apiKeyId,
      });

      res.status(StatusCodes.OK).json({
        id: completionId,
        object: "chat.completion.consensus",
        created,
        ...result,
      });
    } catch (err) {
      if (err instanceof AppError) {
        openAiError(res, err.status, err.message, err.code);
      } else {
        openAiError(
          res,
          500,
          "Consensus failed",
          ErrorCodes.INTERNAL_SERVER_ERROR,
        );
      }
    }
    return;
  }

  // ── Feature 3: Budget-Aware Routing ────────────────────────────────────
  let resolvedModelSlug = modelSlug;

  if (modelSlug === "auto") {
    const selected = await selectModelForBudget(
      budget_usdc!,
      quality,
      messages,
      network,
    );

    if (!selected) {
      const cheapest = await getCheapestModels(messages);
      openAiError(
        res,
        StatusCodes.PAYMENT_REQUIRED,
        `No model fits budget ${budget_usdc} USDC. Cheapest available: ${cheapest.map((m) => `${m.model} (~${m.estimatedCostUsdc} USDC)`).join(", ")}`,
        ErrorCodes.INSUFFICIENT_BALANCE,
      );
      return;
    }

    resolvedModelSlug = selected.modelName;
  }

  // ── Model Resolution ────────────────────────────────────────────────────
  let primaryModel = await resolveModel(resolvedModelSlug);

  if (!primaryModel) {
    openAiError(
      res,
      StatusCodes.BAD_REQUEST,
      `Unknown or inactive model: ${resolvedModelSlug}`,
      ErrorCodes.AI_MODEL_NOT_FOUND,
    );
    return;
  }

  // ── Streaming Path ──────────────────────────────────────────────────────
  if (stream) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    res.flushHeaders();

    let clientDisconnected = false;
    req.on("close", () => {
      clientDisconnected = true;
    });

    try {
      const providerModel = getProviderModel(
        primaryModel.providerName,
        primaryModel.modelName,
      );

      const result = streamText({
        model: providerModel,
        messages: aiMessages,
        instructions,
        temperature,
        maxOutputTokens: max_tokens,
        onFinish: async ({ usage }) => {
          if (clientDisconnected) return;

          try {
            const deductResult = await deductUsage({
              userId,
              network,
              modelPricingId: primaryModel.pricingId,
              inputTokens: usage.inputTokens ?? 0,
              outputTokens: usage.outputTokens ?? 0,
              idempotencyKey: randomUUID(),
              apiKeyId,
            });

            triggerPostRequestEffects({
              userId,
              network,
              apiKeyId,
              costUsdc: deductResult.costUsdc,
              balanceAfter: deductResult.balanceAfter,
            });
          } catch (err) {
            logger.error(
              { err, userId, apiKeyId },
              "BILLING_FAILURE: deductUsage failed after stream",
            );
          }
        },
      });

      for await (const chunk of result.textStream) {
        if (clientDisconnected) break;

        res.write(
          `data: ${JSON.stringify({
            id: completionId,
            object: "chat.completion.chunk",
            created,
            model: resolvedModelSlug,
            choices: [
              { index: 0, delta: { content: chunk }, finish_reason: null },
            ],
          })}\n\n`,
        );
      }

      if (!clientDisconnected) {
        res.write(
          `data: ${JSON.stringify({
            id: completionId,
            object: "chat.completion.chunk",
            created,
            model: resolvedModelSlug,
            choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
          })}\n\n`,
        );
        res.write("data: [DONE]\n\n");
      }
    } catch (err) {
      if (!clientDisconnected) {
        res.write(
          `data: ${JSON.stringify({
            error: {
              message: err instanceof AppError ? err.message : "Provider error",
              type: "provider_error",
              code:
                err instanceof AppError
                  ? err.code
                  : ErrorCodes.AI_PROVIDER_ERROR,
            },
          })}\n\n`,
        );
        res.write("data: [DONE]\n\n");
      }
    } finally {
      res.end();
    }

    return;
  }

  // ── Non-Streaming Path ──────────────────────────────────────────────────
  try {
    const providerModel = getProviderModel(
      primaryModel.providerName,
      primaryModel.modelName,
    );

    const genResult = await generateText({
      model: providerModel,
      messages: aiMessages,
      instructions,
      temperature,
      maxOutputTokens: max_tokens,
    });

    const deductResult = await deductUsage({
      userId,
      network,
      modelPricingId: primaryModel.pricingId,
      inputTokens: genResult.usage.inputTokens ?? 0,
      outputTokens: genResult.usage.outputTokens ?? 0,
      idempotencyKey: randomUUID(),
      apiKeyId,
    });

    triggerPostRequestEffects({
      userId,
      network,
      apiKeyId,
      costUsdc: deductResult.costUsdc,
      balanceAfter: deductResult.balanceAfter,
    });

    res.status(StatusCodes.OK).json({
      id: completionId,
      object: "chat.completion",
      created,
      model: resolvedModelSlug,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: genResult.text },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: genResult.usage.inputTokens ?? 0,
        completion_tokens: genResult.usage.outputTokens ?? 0,
        total_tokens:
          (genResult.usage.inputTokens ?? 0) +
          (genResult.usage.outputTokens ?? 0),
        cost_usdc: deductResult.costUsdc,
      },
    });
  } catch (err) {
    if (err instanceof AppError) {
      openAiError(res, err.status, err.message, err.code);
    } else {
      logger.error({ err, userId }, "Non-stream provider error");
      openAiError(res, 500, "Provider error", ErrorCodes.AI_PROVIDER_ERROR);
    }
  }
}
