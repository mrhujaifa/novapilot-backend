import Decimal from "decimal.js";
import { StatusCodes } from "http-status-codes";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../errors/AppError";
import { ErrorCodes } from "../../errors/error-codes";
import type { DryRunResult } from "./openai-compat.types";

const CHARS_PER_TOKEN = 3;
const MIN_OUTPUT_TOKENS = 100;
const MAX_OUTPUT_TOKENS = 2_000;

function estimateInputTokens(messages: { content: string }[]): number {
  const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
  return Math.ceil(totalChars / CHARS_PER_TOKEN);
}

function calcCost(
  inputPricePerM: string,
  outputPricePerM: string,
  inputTokens: number,
  outputTokens: number,
): Decimal {
  return new Decimal(inputPricePerM)
    .mul(inputTokens)
    .div(1_000_000)
    .add(new Decimal(outputPricePerM).mul(outputTokens).div(1_000_000));
}

/**
 * Estimates cost WITHOUT calling the provider.
 * No balance deducted. No provider call made.
 * Returns min/max range — output tokens unknown before actual call.
 */
export async function estimateRequestCost(
  modelSlug: string,
  messages: { content: string }[],
): Promise<DryRunResult> {
  const pricing = await prisma.modelPricing.findFirst({
    where: {
      aiModel: { modelName: modelSlug, isActive: true },
      effectiveTo: null,
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

  const estimatedInputTokens = estimateInputTokens(messages);

  const minCost = calcCost(
    pricing.inputPricePerM.toString(),
    pricing.outputPricePerM.toString(),
    estimatedInputTokens,
    MIN_OUTPUT_TOKENS,
  );

  const maxCost = calcCost(
    pricing.inputPricePerM.toString(),
    pricing.outputPricePerM.toString(),
    estimatedInputTokens,
    MAX_OUTPUT_TOKENS,
  );

  return {
    model: modelSlug,
    provider: pricing.aiModel.aiProvider.name,
    estimatedInputTokens,
    estimatedMinCostUsdc: minCost.toFixed(6),
    estimatedMaxCostUsdc: maxCost.toFixed(6),
    note: `Output token range assumed ${MIN_OUTPUT_TOKENS}–${MAX_OUTPUT_TOKENS}. Actual cost depends on response length.`,
  };
}
