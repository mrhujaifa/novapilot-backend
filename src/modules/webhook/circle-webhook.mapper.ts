import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { StatusCodes } from "http-status-codes";
import { AppError } from "../../errors/AppError";
import { logger } from "../../lib/logger";
import { handleTransactionComplete } from "./circle-webhook.handler";
import { ErrorCodes } from "../../errors/error-codes";

const circleWebhookPayloadSchema = z.object({
  notificationType: z.string(),
  notification: z.object({
    id: z.string(),
    walletId: z.string().optional(),
    blockchain: z.string(),
    txHash: z.string().optional(),
    amounts: z.array(z.string()).optional(),
    amount: z.string().optional(),
    state: z.string(),
  }),
});

export interface MappedDeposit {
  userId: string;
  walletId: string;
  network: "TESTNET" | "MAINNET";
  txHash: string;
  amount: string;
}

type WebhookResult =
  | { type: "deposit"; data: MappedDeposit }
  | { type: "sweep_update"; handled: true }
  | { type: "skipped"; reason: string };

export async function mapCircleWebhookToDeposit(
  rawBody: unknown,
): Promise<WebhookResult> {
  logger.info({ payload: rawBody }, "Circle webhook received");

  const parsed = circleWebhookPayloadSchema.safeParse(rawBody);
  if (!parsed.success) {
    logger.error(
      { error: parsed.error },
      "Circle webhook payload validation failed",
    );
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Invalid Circle webhook payload shape",
      ErrorCodes.CIRCLE_INVALID_WEBHOOK,
    );
  }

  const { notificationType, notification } = parsed.data;

  // ── Outbound sweep transfer notification ─────────────────────────────────
  // Circle sends these for our triggerSweep() calls — identify and finalize settlement
  if (
    notificationType === "transactions.outbound" ||
    notificationType === "transactions.transfer"
  ) {
    const terminalStates = [
      "COMPLETE",
      "FAILED",
      "CANCELLED",
      "DENIED",
    ] as const;
    type TerminalState = (typeof terminalStates)[number];

    const isTerminal = (terminalStates as readonly string[]).includes(
      notification.state,
    );

    if (isTerminal && notification.id && notification.txHash) {
      await handleTransactionComplete({
        circleTransferId: notification.id,
        txHash: notification.txHash,
        state: notification.state as TerminalState,
      });
      return { type: "sweep_update", handled: true };
    }

    // Non-terminal (INITIATED, PENDING) — no action needed yet
    return {
      type: "skipped",
      reason: `outbound_tx_non_terminal_state:${notification.state}`,
    };
  }

  // ── Inbound deposit notification ─────────────────────────────────────────
  if (!notification.walletId) {
    return { type: "skipped", reason: "no_walletId_on_notification" };
  }

  const wallet = await prisma.wallet.findUnique({
    where: { circleWalletId: notification.walletId },
  });

  if (!wallet) {
    // Could be admin wallet receiving the sweep — skip silently
    logger.info(
      { walletId: notification.walletId },
      "Webhook: no matching user wallet found, skipping",
    );
    return { type: "skipped", reason: "wallet_not_found" };
  }

  const amount = notification.amounts?.[0] ?? notification.amount;
  if (!amount) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Webhook payload missing amount",
      ErrorCodes.CIRCLE_INVALID_WEBHOOK,
    );
  }

  if (!notification.txHash) {
    return { type: "skipped", reason: "no_txHash_yet" };
  }

  return {
    type: "deposit",
    data: {
      userId: wallet.userId,
      walletId: wallet.id,
      network: wallet.network,
      txHash: notification.txHash,
      amount,
    },
  };
}
