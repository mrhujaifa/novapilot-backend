import { logger } from "../../lib/logger";
import { fireWebhookEvent } from "../webhook/webhook.service";
import {
  detectExpensiveRequest,
  detectOffHoursUsage,
  detectRapidSpend,
  detectRequestSpike,
} from "./anomaly.detector";
import type { AnomalyAlert } from "./anomaly.types";
import type { NetworkEnv } from "../../generated/prisma";

/**
 * Runs all anomaly detectors for a given API key after a request completes.
 * Called fire-and-forget from onFinish — never blocks the response.
 *
 * Each detector runs in parallel. Any individual failure is logged and
 * skipped — one broken detector must not silence the others.
 */
export async function checkAnomalies(input: {
  apiKeyId: string;
  userId: string;
  network: NetworkEnv;
  costUsdc: string;
}): Promise<void> {
  const { apiKeyId, userId, network, costUsdc } = input;

  const detectorResults = await Promise.allSettled([
    detectRequestSpike(apiKeyId, userId, network),
    detectOffHoursUsage(apiKeyId, userId, network),
    detectExpensiveRequest(apiKeyId, userId, costUsdc),
    detectRapidSpend(apiKeyId, userId, network),
  ]);

  const alerts: AnomalyAlert[] = [];

  detectorResults.forEach((result, i) => {
    if (result.status === "rejected") {
      logger.warn(
        { detector: i, reason: result.reason },
        "Anomaly detector failed — skipping",
      );
      return;
    }
    if (result.value) {
      alerts.push(result.value);
    }
  });

  if (alerts.length === 0) return;

  // Fire webhook for each alert — also fire-and-forget
  await Promise.allSettled(
    alerts.map((alert) => {
      logger.warn({ alert }, "Anomaly detected");

      return fireWebhookEvent(userId, "apikey.anomaly", {
        type: alert.type,
        severity: alert.severity,
        detail: alert.detail,
        apiKeyId: alert.apiKeyId,
        detectedAt: alert.detectedAt.toISOString(),
        metadata: alert.metadata,
      });
    }),
  );
}
