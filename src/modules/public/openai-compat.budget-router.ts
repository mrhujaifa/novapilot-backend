import { prisma } from "../../lib/prisma";
import { AppError } from "../../errors/AppError";
import { ErrorCodes } from "../../errors/error-codes";
import { StatusCodes } from "http-status-codes";
import { logger } from "../../lib/logger";
import type { QualityHint, ResolvedModel } from "./openai-compat.types";
import type { NetworkEnv } from "../../generated/prisma";
import Decimal from "decimal.js";

type ModelCandidate = ResolvedModel & {
  estimatedCost: Decimal;
  qualityScore: number;
  latencyScore: number;
};

const QUALITY_SCORES: Record<string, number> = {
  "claude-opus-4-5": 100,
  "claude-sonnet-4-5": 85,
  "claude-haiku-4-5": 60,
  "gpt-4o": 90,
  "gpt-4o-mini": 65,
  "gemini-2.0-flash": 70,
  "gemini-2.0-flash-lite": 50,
  "grok-2": 80,
  "deepseek-chat": 72,
  "mistral-large-latest": 75,
};

const LATENCY_SCORES: Record<string, number> = {
  "claude-haiku-4-5": 95,
  "gemini-2.0-flash-lite": 98,
  "gpt-4o-mini": 90,
  "gemini-2.0-flash": 85,
  "claude-sonnet-4-5": 70,
  "gpt-4o": 65,
  "mistral-large-latest": 72,
  "deepseek-chat": 68,
  "grok-2": 60,
  "claude-opus-4-5": 40,
};

const DEFAULT_QUALITY = 50;
const DEFAULT_LATENCY = 50;

function estimateCost(
  inputPricePerM: string,
  outputPricePerM: string,
  estimatedInputTokens: number,
  estimatedOutputTokens = 500,
): Decimal {
  const inputCost = new Decimal(inputPricePerM)
    .mul(estimatedInputTokens)
    .div(1_000_000);
  const outputCost = new Decimal(outputPricePerM)
    .mul(estimatedOutputTokens)
    .div(1_000_000);
  return inputCost.add(outputCost);
}

function estimateInputTokens(messages: { content: string }[]): number {
  const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
  return Math.ceil(totalChars / 3);
}

export async function selectModelForBudget(
  budgetUsdc: string,
  quality: QualityHint,
  messages: { content: string }[],
  network: NetworkEnv,
): Promise<ResolvedModel | null> {
  const budget = new Decimal(budgetUsdc);
  const estimatedInputTokens = estimateInputTokens(messages);

  const pricingRows = await prisma.modelPricing.findMany({
    where: {
      effectiveTo: null,
      aiModel: { isActive: true },
    },
    include: { aiModel: { include: { aiProvider: true } } },
  });

  if (pricingRows.length === 0) {
    throw new AppError(
      StatusCodes.SERVICE_UNAVAILABLE,
      "No active models available",
      ErrorCodes.AI_MODEL_NOT_FOUND,
    );
  }

  const candidates: ModelCandidate[] = [];

  for (const row of pricingRows) {
    const estimatedCost = estimateCost(
      row.inputPricePerM.toString(),
      row.outputPricePerM.toString(),
      estimatedInputTokens,
    );

    if (estimatedCost.gt(budget)) continue;

    const modelName = row.aiModel.modelName;

    candidates.push({
      pricingId: row.id,
      modelName,
      providerName: row.aiModel.aiProvider.name,
      inputPricePerM: row.inputPricePerM.toString(),
      outputPricePerM: row.outputPricePerM.toString(),
      estimatedCost,
      qualityScore: QUALITY_SCORES[modelName] ?? DEFAULT_QUALITY,
      latencyScore: LATENCY_SCORES[modelName] ?? DEFAULT_LATENCY,
    });
  }

  if (candidates.length === 0) {
    logger.warn(
      { budgetUsdc, estimatedInputTokens, quality },
      "No models fit within budget",
    );
    return null;
  }

  const ranked = candidates.sort((a, b) => {
    switch (quality) {
      case "best":
        return b.qualityScore - a.qualityScore;
      case "fast":
        return b.latencyScore - a.latencyScore;
      case "cheap":
        return a.estimatedCost.comparedTo(b.estimatedCost);
    }
  });

  const selected = ranked[0];

  logger.info(
    {
      selected: selected.modelName,
      estimatedCost: selected.estimatedCost.toString(),
      budgetUsdc,
      quality,
      candidateCount: candidates.length,
    },
    "Budget router selected model",
  );

  return selected;
}

export async function getCheapestModels(
  messages: { content: string }[],
  limit = 3,
): Promise<Array<{ model: string; estimatedCostUsdc: string }>> {
  const estimatedInputTokens = estimateInputTokens(messages);

  const pricingRows = await prisma.modelPricing.findMany({
    where: { effectiveTo: null, aiModel: { isActive: true } },
    include: { aiModel: true },
  });

  return pricingRows
    .map((row) => ({
      model: row.aiModel.modelName,
      estimatedCostUsdc: estimateCost(
        row.inputPricePerM.toString(),
        row.outputPricePerM.toString(),
        estimatedInputTokens,
      ).toFixed(6),
    }))
    .sort((a, b) =>
      new Decimal(a.estimatedCostUsdc).comparedTo(
        new Decimal(b.estimatedCostUsdc),
      ),
    )
    .slice(0, limit);
}
