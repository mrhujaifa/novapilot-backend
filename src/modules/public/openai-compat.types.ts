import type { NetworkEnv } from "../../generated/prisma";

// ─── Quality Hint ─────────────────────────────────────────────────────────────

export type QualityHint = "best" | "fast" | "cheap";

export type ConsensusStrategy = "majority" | "judge";

// ─── Resolved Model ───────────────────────────────────────────────────────────

// DB থেকে resolve হওয়া model — controller থেকে সব helper-এ pass হয়।
// Decimal গুলো string হিসেবে carry করা হয় যাতে precision না হারায়।
export type ResolvedModel = {
  pricingId: string;
  modelName: string;
  providerName: string;
  inputPricePerM: string;
  outputPricePerM: string;
};

// ─── Header Context ───────────────────────────────────────────────────────────

// writeNovaPilotHeaders()-এ pass করা হয়।
// Optional fields গুলো streaming path-এ onFinish-এর পরে জানা যায়।
export type HeaderContext = {
  userId: string;
  network: NetworkEnv;
  completionId: string;
  modelSlug: string;
  providerName: string;
  costUsdc?: string;
  balanceAfter?: string;
  inputTokens?: number;
  outputTokens?: number;
  fallbackUsed?: string;
};

// ─── Fallback ─────────────────────────────────────────────────────────────────

export type FallbackResult = {
  inputTokens: number;
  outputTokens: number;
  modelSlug: string;
  providerName: string;
  pricingId: string;
  // Non-streaming path
  text?: string;
  // Streaming path
  stream?: AsyncIterable<string>;
};

export type FallbackAttemptError = {
  modelSlug: string;
  attempt: number;
  reason: string;
};

// ─── Benchmark ────────────────────────────────────────────────────────────────

export type BenchmarkModelResult = {
  model: string;
  provider: string;
  text: string;
  inputTokens: number;
  outputTokens: number;
  costUsdc: string;
  latencyMs: number;
  error?: string;
};

export type BenchmarkResult = {
  results: BenchmarkModelResult[];
  totalCostUsdc: string;
  fastestModel: string;
  cheapestModel: string;
  recommendedModel: string;
};

// ─── Dry Run ──────────────────────────────────────────────────────────────────

export type DryRunResult = {
  model: string;
  provider: string;
  estimatedInputTokens: number;
  // Output token count unknown before actual call — give a range
  estimatedMinCostUsdc: string;
  estimatedMaxCostUsdc: string;
  note: string;
};

// ─── Consensus ────────────────────────────────────────────────────────────────

export type ConsensusModelResponse = {
  model: string;
  provider: string;
  text: string;
  inputTokens: number;
  outputTokens: number;
  costUsdc: string;
};

export type ConsensusResult = {
  finalAnswer: string;
  strategy: ConsensusStrategy;
  agreed: boolean;
  judgeModel?: string;
  responses: ConsensusModelResponse[];
  totalCostUsdc: string;
};

// ─── Webhook ──────────────────────────────────────────────────────────────────

export type WebhookEventType =
  | "balance.low"
  | "balance.critical"
  | "spend.daily_threshold"
  | "spend.request_expensive"
  | "apikey.anomaly";

export type WebhookPayload = {
  event: WebhookEventType;
  timestamp: string;
  novapilot_version: string;
  data: Record<string, unknown>;
};

// ─── Anomaly ──────────────────────────────────────────────────────────────────

export type AnomalyType =
  | "request_spike"
  | "off_hours_usage"
  | "expensive_request"
  | "rapid_key_rotation";

export type AnomalyAlert = {
  type: AnomalyType;
  apiKeyId: string;
  userId: string;
  severity: "low" | "medium" | "high";
  detail: string;
  detectedAt: Date;
};
