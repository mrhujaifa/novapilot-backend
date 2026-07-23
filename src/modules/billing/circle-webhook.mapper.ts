import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { StatusCodes } from "http-status-codes";
import { AppError } from "../../utils/AppError";

// Circle's notification payload shape (transaction/transfer event).
// Reference: Circle Developer-Controlled Wallets notification schema.
// Adjust field names here if Circle's actual payload differs from this — this is the
// single place that should change, nothing else in the codebase depends on Circle's raw shape.
const circleWebhookPayloadSchema = z.object({
  notificationType: z.string(), // e.g. "transactions.inbound"
  notification: z.object({
    id: z.string(), // Circle transaction id
    walletId: z.string(), // Circle wallet id — maps to our Wallet.circleWalletId
    blockchain: z.string(), // e.g. "ETH-SEPOLIA", "MATIC-AMOY" — used to derive our NetworkEnv
    txHash: z.string(),
    amounts: z.array(z.string()), // Circle returns amounts as string array, USDC is first entry
    state: z.string(), // "COMPLETE" | "PENDING" | "FAILED"
  }),
});

interface MappedDeposit {
  userId: string;
  walletId: string;
  network: "TESTNET" | "MAINNET";
  txHash: string;
  amount: string;
}

// Circle blockchain identifiers -> our internal NetworkEnv.
// Testnet-first: everything not explicitly mainnet maps to TESTNET.
const MAINNET_BLOCKCHAINS = new Set(["ETH", "MATIC", "AVAX", "ARB"]);

function toNetworkEnv(blockchain: string): "TESTNET" | "MAINNET" {
  const base = blockchain.split("-")[0];
  return MAINNET_BLOCKCHAINS.has(base) ? "MAINNET" : "TESTNET";
}

/**
 * Validates and transforms a raw Circle webhook payload into our internal deposit shape.
 * Throws AppError(400) if the payload doesn't match Circle's expected schema,
 * or AppError(404) if the wallet isn't tracked in our database.
 */
export async function mapCircleWebhookToDeposit(rawBody: unknown): Promise<MappedDeposit> {
  const parsed = circleWebhookPayloadSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Invalid Circle webhook payload shape");
  }

  const { notification } = parsed.data;

  if (notification.state !== "COMPLETE") {
    // Only credit on confirmed transfers; PENDING/FAILED are ignored here.
    // Circle will send a follow-up webhook once state changes to COMPLETE.
    throw new AppError(StatusCodes.OK, "Deposit not yet confirmed, ignoring");
  }

  const wallet = await prisma.wallet.findUnique({
    where: { circleWalletId: notification.walletId },
  });

  if (!wallet) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      `No wallet found for Circle walletId ${notification.walletId}`,
    );
  }

  const amount = notification.amounts[0];
  if (!amount) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Webhook payload missing amount");
  }

  return {
    userId: wallet.userId,
    walletId: wallet.id,
    network: toNetworkEnv(notification.blockchain),
    txHash: notification.txHash,
    amount,
  };
}
