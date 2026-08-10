import { prisma } from "../../lib/prisma";
import type {
  AnomalyAlert,
  AnomalyType,
  AnomalySeverity,
} from "./anomaly.types";
import type { NetworkEnv } from "../../generated/prisma";
import { Decimal } from "../../generated/prisma/runtime/client";

// ─── Thresholds ───────────────────────────────────────────────────────────────

const SPIKE_MULTIPLIER = 10; // 10x normal hourly rate
const EXPENSIVE_REQUEST_USDC = "0.10"; // Single request > $0.10
const OFF_HOURS_START_UTC = 1; // 1:00 AM UTC
const OFF_HOURS_END_UTC = 5; // 5:00 AM UTC
const RAPID_SPEND_MULTIPLIER = 3; // Hourly spend > 3x daily average per hour

function severity(type: AnomalyType, magnitude: number): AnomalySeverity {
  if (type === "expensive_request") return magnitude > 0.5 ? "high" : "medium";
  if (type === "request_spike") return magnitude > 20 ? "high" : "medium";
  if (type === "rapid_spend") return magnitude > 5 ? "high" : "medium";
  return "low";
}

// ─── Detectors ────────────────────────────────────────────────────────────────

export async function detectRequestSpike(
  apiKeyId: string,
  userId: string,
  network: NetworkEnv,
): Promise<AnomalyAlert | null> {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [lastHour, lastDay] = await Promise.all([
    prisma.usageLog.count({
      where: { apiKeyId, createdAt: { gte: oneHourAgo } },
    }),
    prisma.usageLog.count({
      where: { apiKeyId, createdAt: { gte: oneDayAgo, lt: oneHourAgo } },
    }),
  ]);

  // Normalise day count to per-hour average
  const avgHourly = lastDay / 23;
  if (avgHourly < 5) return null; // Not enough history for meaningful spike detection

  const multiplier = lastHour / avgHourly;
  if (multiplier < SPIKE_MULTIPLIER) return null;

  return {
    type: "request_spike",
    apiKeyId,
    userId,
    severity: severity("request_spike", multiplier),
    detail: `${lastHour} requests in the last hour vs avg ${avgHourly.toFixed(1)}/hr (${multiplier.toFixed(1)}x spike)`,
    detectedAt: now,
    metadata: { lastHour, avgHourly, multiplier },
  };
}

export async function detectOffHoursUsage(
  apiKeyId: string,
  userId: string,
  network: NetworkEnv,
): Promise<AnomalyAlert | null> {
  const now = new Date();
  const hour = now.getUTCHours();

  if (hour < OFF_HOURS_START_UTC || hour >= OFF_HOURS_END_UTC) return null;

  // Only alert if meaningful volume — single accidental request shouldn't fire
  const recentCount = await prisma.usageLog.count({
    where: {
      apiKeyId,
      createdAt: { gte: new Date(now.getTime() - 15 * 60 * 1000) },
    },
  });

  if (recentCount < 3) return null;

  return {
    type: "off_hours_usage",
    apiKeyId,
    userId,
    severity: "low",
    detail: `${recentCount} requests detected between ${OFF_HOURS_START_UTC}:00–${OFF_HOURS_END_UTC}:00 UTC`,
    detectedAt: now,
    metadata: { utcHour: hour, recentCount },
  };
}

export async function detectExpensiveRequest(
  apiKeyId: string,
  userId: string,
  costUsdc: string,
): Promise<AnomalyAlert | null> {
  const cost = new Decimal(costUsdc);
  const threshold = new Decimal(EXPENSIVE_REQUEST_USDC);

  if (cost.lt(threshold)) return null;

  return {
    type: "expensive_request",
    apiKeyId,
    userId,
    severity: severity("expensive_request", cost.toNumber()),
    detail: `Single request cost ${cost.toFixed(6)} USDC (threshold: ${EXPENSIVE_REQUEST_USDC} USDC)`,
    detectedAt: new Date(),
    metadata: { costUsdc, thresholdUsdc: EXPENSIVE_REQUEST_USDC },
  };
}

export async function detectRapidSpend(
  apiKeyId: string,
  userId: string,
  network: NetworkEnv,
): Promise<AnomalyAlert | null> {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [lastHour, lastDay] = await Promise.all([
    prisma.usageLog.aggregate({
      where: { apiKeyId, createdAt: { gte: oneHourAgo } },
      _sum: { costUsdc: true },
    }),
    prisma.usageLog.aggregate({
      where: { apiKeyId, createdAt: { gte: oneDayAgo, lt: oneHourAgo } },
      _sum: { costUsdc: true },
    }),
  ]);

  const hourlySpend = new Decimal(lastHour._sum.costUsdc?.toString() ?? "0");
  const dailySpend = new Decimal(lastDay._sum.costUsdc?.toString() ?? "0");

  if (dailySpend.eq(0)) return null;

  const avgHourlySpend = dailySpend.div(23);
  if (avgHourlySpend.lt("0.001")) return null; // Too small to be meaningful

  const multiplier = hourlySpend.div(avgHourlySpend).toNumber();
  if (multiplier < RAPID_SPEND_MULTIPLIER) return null;

  return {
    type: "rapid_spend",
    apiKeyId,
    userId,
    severity: severity("rapid_spend", multiplier),
    detail: `Spent ${hourlySpend.toFixed(6)} USDC in last hour vs avg ${avgHourlySpend.toFixed(6)} USDC/hr (${multiplier.toFixed(1)}x)`,
    detectedAt: now,
    metadata: {
      hourlySpend: hourlySpend.toString(),
      avgHourlySpend: avgHourlySpend.toString(),
      multiplier,
    },
  };
}
