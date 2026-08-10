import { generateText } from "ai";
import { randomUUID } from "crypto";
import { StatusCodes } from "http-status-codes";
import { prisma } from "../../lib/prisma";
import { deductUsage } from "../billing/billing.service";
import { getProviderModel } from "../agent/provider-registry";
import { splitSystemMessages } from "./openai-compat.utils";
import { AppError } from "../../errors/AppError";
import { ErrorCodes } from "../../errors/error-codes";
import { logger } from "../../lib/logger";
import type { ModelMessage } from "ai";
import type { NetworkEnv } from "../../generated/prisma";
import type {
  ConsensusResult,
  ConsensusModelResponse,
  ConsensusStrategy,
} from "./openai-compat.types";
import Decimal from "decimal.js";

type ConsensusInput = {
  models: string[];
  messages: ModelMessage[];
  strategy: ConsensusStrategy;
  userId: string;
  network: NetworkEnv;
  apiKeyId: string;
};

// Judge model — most capable model available for tie-breaking
const JUDGE_MODEL = "claude-sonnet-4-5";

/**
 * Runs the same prompt against multiple models, then determines
 * a final answer via majority vote or a judge model.
 *
 * All participating models are billed. Judge model (if used) is
 * also billed. This is clearly documented in the API response.
 */
export async function runConsensus(
  input: ConsensusInput,
): Promise<ConsensusResult> {
  const { models, messages, strategy, userId, network, apiKeyId } = input;

  // Run all models in parallel
  const settled = await Promise.allSettled(
    models.map((slug) =>
      callModel({ modelSlug: slug, messages, userId, network, apiKeyId }),
    ),
  );

  const responses: ConsensusModelResponse[] = [];
  const failures: string[] = [];

  settled.forEach((result, i) => {
    if (result.status === "fulfilled") {
      responses.push(result.value);
    } else {
      failures.push(models[i]);
      logger.warn(
        { model: models[i], reason: result.reason },
        "Consensus model failed",
      );
    }
  });

  // Need at least 2 successful responses for meaningful consensus
  if (responses.length < 2) {
    throw new AppError(
      StatusCodes.BAD_GATEWAY,
      `Consensus requires at least 2 successful responses. Failed models: ${failures.join(", ")}`,
      ErrorCodes.AI_PROVIDER_ERROR,
    );
  }

  const totalCostUsdc = responses
    .reduce((sum, r) => sum.add(new Decimal(r.costUsdc)), new Decimal(0))
    .toFixed(6);

  if (strategy === "majority") {
    return resolveMajority(responses, totalCostUsdc);
  }

  return resolveWithJudge({
    responses,
    messages,
    userId,
    network,
    apiKeyId,
    totalCostUsdc,
  });
}

// ─── Majority Strategy ────────────────────────────────────────────────────────

function resolveMajority(
  responses: ConsensusModelResponse[],
  totalCostUsdc: string,
): ConsensusResult {
  // Simple semantic similarity: check if any two responses share
  // significant overlap (>60% common words). If yes → agreed.
  // This is intentionally simple — true NLP similarity would require
  // an embedding call which adds cost and latency.
  const texts = responses.map((r) => r.text.toLowerCase());

  function wordOverlap(a: string, b: string): number {
    const wordsA = new Set(a.split(/\s+/).filter((w) => w.length > 3));
    const wordsB = new Set(b.split(/\s+/).filter((w) => w.length > 3));
    if (wordsA.size === 0) return 0;
    const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
    return intersection / wordsA.size;
  }

  let maxOverlap = 0;
  let bestPair = [0, 1];

  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const overlap = wordOverlap(texts[i], texts[j]);
      if (overlap > maxOverlap) {
        maxOverlap = overlap;
        bestPair = [i, j];
      }
    }
  }

  const agreed = maxOverlap > 0.6;

  // Pick the longer response from the agreeing pair as final answer —
  // more detail is generally better for majority-agreed responses
  const finalAnswer = agreed
    ? responses[bestPair[0]].text.length >= responses[bestPair[1]].text.length
      ? responses[bestPair[0]].text
      : responses[bestPair[1]].text
    : responses[0].text; // Fallback: first model's response

  return {
    finalAnswer,
    strategy: "majority",
    agreed,
    responses,
    totalCostUsdc,
  };
}

// ─── Judge Strategy ───────────────────────────────────────────────────────────

async function resolveWithJudge(input: {
  responses: ConsensusModelResponse[];
  messages: ModelMessage[];
  userId: string;
  network: NetworkEnv;
  apiKeyId: string;
  totalCostUsdc: string;
}): Promise<ConsensusResult> {
  const { responses, messages, userId, network, apiKeyId } = input;

  const originalQuestion =
    messages.filter((m) => m.role === "user").pop()?.content ?? "";

  const judgePrompt = `You are an impartial judge evaluating AI responses.

Original question: ${originalQuestion}

Responses from different AI models:
${responses.map((r, i) => `Model ${i + 1} (${r.model}):\n${r.text}`).join("\n\n---\n\n")}

Select the most accurate, complete, and helpful response. Reply with ONLY the text of the best response — do not add commentary or explanation.`;

  const judgeResult = await callModel({
    modelSlug: JUDGE_MODEL,
    messages: [{ role: "user", content: judgePrompt }],
    userId,
    network,
    apiKeyId,
  });

  const judgeCost = new Decimal(input.totalCostUsdc)
    .add(new Decimal(judgeResult.costUsdc))
    .toFixed(6);

  return {
    finalAnswer: judgeResult.text,
    strategy: "judge",
    agreed: false, // judge mode always means models disagreed enough to need arbitration
    judgeModel: JUDGE_MODEL,
    responses,
    totalCostUsdc: judgeCost,
  };
}

// ─── Shared Model Caller ──────────────────────────────────────────────────────

async function callModel(input: {
  modelSlug: string;
  messages: ModelMessage[];
  userId: string;
  network: NetworkEnv;
  apiKeyId: string;
}): Promise<ConsensusModelResponse> {
  const { modelSlug, messages, userId, network, apiKeyId } = input;

  const pricing = await prisma.modelPricing.findFirst({
    where: {
      aiModel: { modelName: modelSlug, isActive: true },
      effectiveTo: null,
    },
    include: { aiModel: { include: { aiProvider: true } } },
  });

  if (!pricing) throw new Error(`Unknown or inactive model: ${modelSlug}`);

  const providerModel = getProviderModel(
    pricing.aiModel.aiProvider.name,
    pricing.aiModel.modelName,
  );

  const _norm = splitSystemMessages(messages);

  const result = await generateText({
    model: providerModel,
    messages: _norm.messages,
    instructions: _norm.instructions,
  });

  const deductResult = await deductUsage({
    userId,
    network,
    modelPricingId: pricing.id,
    inputTokens: result.usage.inputTokens ?? 0,
    outputTokens: result.usage.outputTokens ?? 0,
    idempotencyKey: randomUUID(),
    apiKeyId,
  });

  return {
    model: modelSlug,
    provider: pricing.aiModel.aiProvider.name,
    text: result.text,
    inputTokens: result.usage.inputTokens ?? 0,
    outputTokens: result.usage.outputTokens ?? 0,
    costUsdc: deductResult.costUsdc,
  };
}
