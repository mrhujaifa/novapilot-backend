import { prisma } from "../../lib/prisma";
import { logger } from "../../lib/logger";
import { SettlementStatus } from "../../generated/prisma";

type TerminalState = "COMPLETE" | "FAILED" | "CANCELLED" | "DENIED";

/**
 * Called from circle-webhook.mapper.ts when a Circle transaction notification
 * arrives with a terminal state. Finalizes the Settlement record created by
 * triggerSweep() — webhook is the source of truth for txHash and final status.
 */
export async function handleTransactionComplete(payload: {
  circleTransferId: string;
  txHash: string;
  state: TerminalState;
}): Promise<void> {
  const { circleTransferId, txHash, state } = payload;

  const settlement = await prisma.settlement.findFirst({
    where: { circleTransferId },
  });

  if (!settlement) {
    // Not a sweep we initiated — could be any other Circle transaction
    logger.info({ circleTransferId }, "No matching settlement found, skipping");
    return;
  }

  if (
    settlement.status === SettlementStatus.SUCCESS ||
    settlement.status === SettlementStatus.FAILED
  ) {
    logger.info(
      { settlementId: settlement.id },
      "Settlement already finalized",
    );
    return;
  }
  const newStatus =
    state === "COMPLETE" ? SettlementStatus.SUCCESS : SettlementStatus.FAILED;

  await prisma.settlement.update({
    where: { id: settlement.id },
    data: { status: newStatus, txHash },
  });

  logger.info(
    {
      settlementId: settlement.id,
      circleTransferId,
      txHash,
      previousStatus: settlement.status,
      newStatus,
    },
    "Settlement finalized via webhook",
  );
}
