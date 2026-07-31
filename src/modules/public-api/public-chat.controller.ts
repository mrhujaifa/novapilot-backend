// src/modules/public-api/public-chat.controller.ts

import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { generateText } from "ai";
import { randomUUID } from "crypto";
import { AppError } from "../../utils/AppError";
import { prisma } from "../../lib/prisma";
import { deductUsage } from "../billing/billing.service";
import { publicChatSchema } from "./public-chat.schema";
import { asyncHandler } from "../../utils/asyncHandler";
import { getProviderModel } from "../agent/provider-registry";

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
      );
    }

    const { model: modelSlug, message } = parsed.data;

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

    res.status(StatusCodes.OK).json({
      success: true,
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
