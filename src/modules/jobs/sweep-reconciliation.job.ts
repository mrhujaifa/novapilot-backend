// src/jobs/sweep-reconciliation.job.ts

import { logger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { triggerSweep } from "../billing/sweep.service";

/**
 * Retries PENDING/FAILED settlements older than 2 minutes.
 * Runs every 5 minutes via setInterval in src/index.ts.
 * Covers cases where triggerSweep() failed due to network error,
 * Circle API timeout, or process restart mid-sweep.
 */
export async function reconcilePendingSettlements(): Promise<void> {
  const staleThreshold = new Date(Date.now() - 2 * 60 * 1000); // 2 minutes ago

  const staleSettlements = await prisma.settlement.findMany({
    where: {
      status: { in: ["PENDING", "FAILED"] },
      createdAt: { lt: staleThreshold },
    },
    take: 50, // process in batches — avoid overwhelming Circle API
  });

  if (staleSettlements.length === 0) return;

  logger.info({ count: staleSettlements.length }, "Reconciling stale settlements");

  for (const s of staleSettlements) {
    await triggerSweep({
      userId: s.userId,
      network: s.network,
      amountUsdc: s.amountUsdc.toString(),
    }).catch((err) => {
      logger.error({ settlementId: s.id, err }, "Reconciliation retry failed");
    });
  }
}
