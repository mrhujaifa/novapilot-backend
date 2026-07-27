import { streamText } from "ai";
import { StatusCodes } from "http-status-codes";
import { prisma } from "../../lib/prisma";
import { logger } from "../../lib/logger";
import { getProviderModel } from "./provider-registry";
import { deductUsage, InsufficientBalanceError } from "../billing/billing.service";
import type { NetworkEnv } from "../../generated/prisma/enums";
import { randomUUID } from "crypto";
import { AppError } from "../../utils/AppError";
import { triggerSweep } from "../billing/sweep.service";

interface HandleChatInput {
  userId: string;
  network: NetworkEnv;
  modelPricingId: string;
  prompt: string;
}

/**
 * Resolves the model/provider for a request and validates the pricing
 * snapshot is still active. Throws before any provider call is made,
 * so we never bill or stream against a stale/inactive price.
 */
async function resolveModel(modelPricingId: string) {
  const pricing = await prisma.modelPricing.findUnique({
    where: { id: modelPricingId },
    include: { aiModel: { include: { aiProvider: true } } },
  });

  if (!pricing) {
    throw new AppError(StatusCodes.NOT_FOUND, "Model pricing not found");
  }
  if (!pricing.aiModel.isActive) {
    throw new AppError(StatusCodes.BAD_REQUEST, "This model is no longer available");
  }
  if (pricing.effectiveTo && pricing.effectiveTo < new Date()) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Pricing snapshot expired, refetch /api/models");
  }

  return pricing;
}

/**
 * Streams an AI response and, once complete, atomically bills the user
 * and persists chat history. The client stream is never blocked by
 * billing/history writes — those happen in onFinish, off the response path.
 */
export async function handleChatStream(input: HandleChatInput) {
  const { userId, network, modelPricingId, prompt } = input;

  const pricing = await resolveModel(modelPricingId);
  const model = getProviderModel(pricing.aiModel.aiProvider.name, pricing.aiModel.modelName);

  // Idempotency key generated per request — protects against duplicate
  // billing if onFinish somehow fires twice (SDK retry, process restart, etc).
  const idempotencyKey = randomUUID();

  const result = streamText({
    model,
    prompt,
    onFinish: async ({ text, usage }) => {
      try {
        const deductResult = await deductUsage({
          userId,
          network,
          modelPricingId,
          inputTokens: usage.inputTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
          idempotencyKey,
        });

        // ── sweep trigger ─────────────────────────────────────────────────
        if (deductResult.sweepTriggered && deductResult.sweepAmount) {
          void triggerSweep({ userId, network, amountUsdc: deductResult.sweepAmount });
        }
        await prisma.chatHistory.create({
          data: {
            userId,
            network,
            modelPricingId,
            prompt,
            response: text,
            inputTokens: usage.inputTokens ?? 0,
            outputTokens: usage.outputTokens ?? 0,
            usageLogId: deductResult.usageLogId,
          },
        });

        logger.info(
          { userId, modelPricingId, cost: deductResult.costUsdc },
          "Chat completed, billed, and saved",
        );
      } catch (error) {
        // Response already streamed to the client at this point — we can't
        // undo that. Log loudly so ops can reconcile/refund manually if this
        // was a genuine billing failure (e.g. insufficient balance race).
        logger.error(
          { err: error, userId, modelPricingId },
          "CRITICAL: failed to bill/save chat after streaming response to client",
        );
      }
    },
  });

  return result;
}

/**
 * Pre-flight balance check before starting a stream — avoids generating
 * a full (potentially expensive) response only to fail billing afterward.
 * This is a best-effort check, not a lock: the real guard against
 * over-spend is still the atomic deductUsage() call in onFinish.
 */
export async function assertHasBalance(userId: string, network: NetworkEnv): Promise<void> {
  const balance = await prisma.balance.findUnique({
    where: { userId_network: { userId, network } },
  });

  if (!balance || balance.amount.lessThanOrEqualTo(0)) {
    throw new InsufficientBalanceError(userId, "> 0", balance?.amount.toString() ?? "0");
  }
}
