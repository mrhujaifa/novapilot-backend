import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { generateText } from "ai";
import { randomUUID } from "crypto";
import { AppError } from "../../errors/AppError";
import { prisma } from "../../lib/prisma";
import { deductUsage } from "../billing/billing.service";
import { publicChatSchema } from "./public-chat.schema";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendApiResponse } from "../../utils/sendApiResponse";
import { getProviderModel } from "../agent/provider-registry";
import { assertHasBalance } from "../agent/ai-router.service";
import { ErrorCodes } from "../../errors/error-codes";

/**
 * POST /v1/chat
 * Public, API-key-authenticated endpoint for external integrations
 * (Discord bots, VS Code extensions, third-party apps). Stateless —
 * no conversation history is persisted; each call is a single independent
 * exchange. Billing runs through the same deductUsage() the dashboard
 * chat uses, tagged with the API key that made the request.
 *
 * Non-streaming by design for v1: simpler for external clients to
 * integrate against (no SSE parsing required). Streaming can be added
 * as a separate endpoint (/v1/chat/stream) later without breaking this one.
 */
export const publicChatHandler = asyncHandler(
  async (req: Request, res: Response) => {
    // requireApiKey middleware guarantees this is populated before we get here.
    const { userId, network, apiKeyId } = req.apiKeyContext!;

    const parsed = publicChatSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        parsed.error.issues[0].message,
        ErrorCodes.VALIDATION_ERROR,
      );
    }

    const { model: modelSlug, message } = parsed.data;

    // Fail fast on zero/negative balance before spending anything on the
    // provider call — same principle as the dashboard chat flow. Without
    // this, a request from an empty-balance key would still generate (and
    // pay for) a full AI response that can never be billed back to the user.
    await assertHasBalance(userId, network);

    // Resolve the human-friendly model slug (e.g. "claude-3-5-sonnet") to an
    // active ModelPricing row. Public API clients reference models by slug,
    // not by internal modelPricingId, since that ID isn't meant to be a
    // stable public contract.
    const pricing = await prisma.modelPricing.findFirst({
      where: {
        aiModel: { modelName: modelSlug, isActive: true },
        effectiveTo: null, // current pricing snapshot only
      },
      include: { aiModel: { include: { aiProvider: true } } },
    });

    if (!pricing) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        `Unknown or inactive model: ${modelSlug}`,
        ErrorCodes.AI_MODEL_NOT_FOUND,
      );
    }

    const providerModel = getProviderModel(
      pricing.aiModel.aiProvider.name,
      pricing.aiModel.modelName,
    );

    const idempotencyKey = randomUUID();

    const result = await generateText({
      model: providerModel,
      messages: [{ role: "user", content: message }],
    });

    const deductResult = await deductUsage({
      userId,
      network,
      modelPricingId: pricing.id,
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
      idempotencyKey,
      apiKeyId,
    });

    sendApiResponse(res, {
      httpStatusCode: StatusCodes.OK,
      success: true,
      message: "Chat completion generated successfully",
      data: {
        reply: result.text,
        model: modelSlug,
        usage: {
          inputTokens: result.usage.inputTokens ?? 0,
          outputTokens: result.usage.outputTokens ?? 0,
          costUsdc: deductResult.costUsdc,
        },
      },
    });
  },
);
