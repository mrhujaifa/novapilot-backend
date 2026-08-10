import { generateText, ModelMessage } from "ai";
import { splitSystemMessages } from "./openai-compat.utils";
import { randomUUID } from "crypto";
import { prisma } from "../../lib/prisma";
import { deductUsage } from "../billing/billing.service";
import { getProviderModel } from "../agent/provider-registry";
import { logger } from "../../lib/logger";
import type { NetworkEnv } from "../../generated/prisma";
import type {
  BenchmarkModelResult,
  BenchmarkResult,
} from "./openai-compat.types";
import Decimal from "decimal.js";

type BenchmarkInput = {
  models: string[];
  messages: ModelMessage[];
  userId: string;
  network: NetworkEnv;
  apiKeyId: string;
  temperature?: number;
  maxTokens?: number;
};

/**
 * Runs the same prompt against multiple models in parallel.
 * Each model is billed independently.
 * Failed models are included in results with error field set —
 * they are NOT billed.
 *
 * Returns aggregated results with cost + latency comparison so the
 * caller can make an informed model choice for future requests.
 */
export async function runBenchmark(
  input: BenchmarkInput,
): Promise<BenchmarkResult> {
  const {
    models,
    messages,
    userId,
    network,
    apiKeyId,
    temperature,
    maxTokens,
  } = input;

  // Run all models in parallel — benchmark value comes from simultaneous comparison
  const settled = await Promise.allSettled(
    models.map((modelSlug) =>
      runSingleModel({
        modelSlug,
        messages,
        userId,
        network,
        apiKeyId,
        temperature,
        maxTokens,
      }),
    ),
  );

  const results: BenchmarkModelResult[] = settled.map((result, i) => {
    if (result.status === "fulfilled") return result.value;

    const reason =
      result.reason instanceof Error ? result.reason.message : "Unknown error";

    logger.warn({ modelSlug: models[i], reason }, "Benchmark model failed");

    return {
      model: models[i],
      provider: "unknown",
      text: "",
      inputTokens: 0,
      outputTokens: 0,
      costUsdc: "0.000000",
      latencyMs: 0,
      error: reason,
    };
  });

  const successfulResults = results.filter((r) => !r.error);

  // Total cost across all successful model calls
  const totalCostUsdc = results
    .reduce((sum, r) => sum.add(new Decimal(r.costUsdc)), new Decimal(0))
    .toFixed(6);

  const fastestModel = successfulResults.length
    ? successfulResults.reduce((a, b) => (a.latencyMs < b.latencyMs ? a : b))
        .model
    : "none";

  const cheapestModel = successfulResults.length
    ? successfulResults.reduce((a, b) =>
        new Decimal(a.costUsdc).lt(new Decimal(b.costUsdc)) ? a : b,
      ).model
    : "none";

  // Recommended = best quality-to-cost ratio among successful results
  // Simple heuristic: lowest cost among models with output length > median
  const medianOutputTokens = successfulResults.length
    ? successfulResults.map((r) => r.outputTokens).sort((a, b) => a - b)[
        Math.floor(successfulResults.length / 2)
      ]
    : 0;

  const recommendedModel =
    successfulResults
      .filter((r) => r.outputTokens >= medianOutputTokens)
      .sort((a, b) =>
        new Decimal(a.costUsdc).comparedTo(new Decimal(b.costUsdc)),
      )[0]?.model ?? fastestModel;

  return {
    results,
    totalCostUsdc,
    fastestModel,
    cheapestModel,
    recommendedModel,
  };
}

// ─── Single Model Runner ──────────────────────────────────────────────────────

async function runSingleModel(input: {
  modelSlug: string;
  messages: ModelMessage[];
  userId: string;
  network: NetworkEnv;
  apiKeyId: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<BenchmarkModelResult> {
  const {
    modelSlug,
    messages,
    userId,
    network,
    apiKeyId,
    temperature,
    maxTokens,
  } = input;

  const pricing = await prisma.modelPricing.findFirst({
    where: {
      aiModel: { modelName: modelSlug, isActive: true },
      effectiveTo: null,
    },
    include: { aiModel: { include: { aiProvider: true } } },
  });

  if (!pricing) {
    throw new Error(`Unknown or inactive model: ${modelSlug}`);
  }

  const providerModel = getProviderModel(
    pricing.aiModel.aiProvider.name,
    pricing.aiModel.modelName,
  );

  const startMs = Date.now();

  const _norm = splitSystemMessages(messages);

  const result = await generateText({
    model: providerModel,
    messages: _norm.messages,
    instructions: _norm.instructions,
    temperature,
    maxOutputTokens: maxTokens,
  });

  const latencyMs = Date.now() - startMs;

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
    latencyMs,
  };
}
