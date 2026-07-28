import { StatusCodes } from "http-status-codes";
import { env } from "../../config/env.config";
import { Prisma } from "../../generated/prisma/client";
import { TransactionType } from "../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import type { TransactionQuery } from "./wallet.dto";
import { CreatedWallet } from "./wallet.type";
import { circleClient } from "../../lib/circle";
import { logger } from "../../lib/logger";

interface BalanceSummary {
  available: string; // decimal string, USDC precision preserved
  network: string;
  walletAddress: string | null;
}

/**
 * Returns the current available balance for the user on the given network.
 * Reads from the Balance table (maintained by the billing engine's
 * SELECT FOR UPDATE flow) rather than recomputing from Transaction history,
 * since Balance is the authoritative running total.
 */
export async function getBalanceSummary(
  userId: string,
  network: "TESTNET" | "MAINNET",
): Promise<BalanceSummary> {
  const [balance, wallet] = await Promise.all([
    prisma.balance.findUnique({
      where: { userId_network: { userId, network } },
    }),
    prisma.wallet.findUnique({
      where: { userId_network: { userId, network } },
      select: { address: true },
    }),
  ]);

  if (!balance) {
    throw new AppError(404, "Balance not initialized for this network.");
  }

  return {
    available: balance.amount.toString(),
    network,
    walletAddress: wallet?.address ?? null,
  };
}

interface TransactionListItem {
  id: string;
  label: string;
  type: "deposit" | "debit";
  amountUsdc: string;
  balanceAfter: string;
  status: "completed" | "pending";
  createdAt: string;
}

interface TransactionListResult {
  data: TransactionListItem[];
  pagination: { total: number; limit: number; offset: number };
}

// const getCircleBlockchain = env.CHAIN_ENV === "mainnet" ? "ETH" : "ETH-SEPOLIA";
// The Wallet Set is created ONCE for the whole app (via a one-time setup script),
// not per user. Its ID must be stored in env so every wallet creation call reuses it.
function getWalletSetId(): string {
  if (!env.CIRCLE_WALLET_SET_ID) {
    throw new AppError(
      StatusCodes.INTERNAL_SERVER_ERROR,
      "CIRCLE_WALLET_SET_ID is not configured — run the wallet-set setup script first",
    );
  }
  return env.CIRCLE_WALLET_SET_ID;
}
/**
 * Creates a single new Circle wallet for a user under the shared Wallet Set.
 * Idempotent: if a wallet already exists for this user (in our DB), returns
 * it instead of creating a duplicate Circle wallet.
 */
export async function createCircleWallet(userId: string): Promise<CreatedWallet> {
  const existing = await prisma.wallet.findUnique({
    where: {
      userId_network: { userId, network: env.CHAIN_ENV === "mainnet" ? "MAINNET" : "TESTNET" },
    },
  });
  if (existing) {
    return { circleWalletId: existing.circleWalletId, walletAddress: existing.address };
  }

  try {
    const response = await circleClient.createWallets({
      accountType: "SCA", // Smart Contract Account, supports gas sponsorship later
      blockchains: ["ARC-TESTNET"],
      count: 1,
      walletSetId: getWalletSetId(),
      metadata: [{ refId: userId }], // links Circle wallet back to our internal user id
    });

    const wallet = response.data?.wallets?.[0];

    if (!wallet) {
      throw new AppError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "Circle wallet creation returned no wallet",
      );
    }

    return {
      circleWalletId: wallet.id,
      walletAddress: wallet.address,
    };
  } catch (err) {
    logger.error({ err, userId }, "Circle wallet creation failed");
    throw new AppError(StatusCodes.INTERNAL_SERVER_ERROR, "Failed to create wallet");
  }
}

/**
 * Human-readable label per transaction, built from its linked deposit or
 * usage log — mirrors the "Prompt Execution — Claude 3.5 Sonnet" /
 * "Testnet Faucet Deposit" style labels used in the wallet UI.
 */
function buildLabel(tx: {
  type: TransactionType;
  deposit: { txHash: string } | null;
  usageLog: { modelPricing: { aiModel: { displayName: string } } } | null;
}): string {
  if (tx.type === "CREDIT") {
    return tx.deposit ? "USDC Deposit" : "Balance Credit";
  }

  const modelName = tx.usageLog?.modelPricing?.aiModel?.displayName;
  return modelName ? `Prompt Execution — ${modelName}` : "Usage Deduction";
}

export async function getTransactionHistory(
  userId: string,
  query: TransactionQuery,
): Promise<TransactionListResult> {
  const { network, filter, limit, offset } = query;

  const typeFilter: Prisma.TransactionWhereInput =
    filter === "deposit"
      ? { type: TransactionType.CREDIT }
      : filter === "debit"
        ? { type: TransactionType.DEBIT }
        : {};

  const where: Prisma.TransactionWhereInput = {
    userId,
    network,
    ...typeFilter,
  };

  const [rows, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        deposit: { select: { txHash: true, status: true } },
        usageLog: {
          select: {
            modelPricing: {
              select: { aiModel: { select: { displayName: true } } },
            },
          },
        },
      },
    }),
    prisma.transaction.count({ where }),
  ]);

  const data: TransactionListItem[] = rows.map((tx) => ({
    id: tx.id,
    label: buildLabel(tx),
    type: tx.type === TransactionType.CREDIT ? "deposit" : "debit",
    amountUsdc: tx.amountUsdc.toString(),
    balanceAfter: tx.balanceAfter.toString(),
    status: tx.deposit
      ? tx.deposit.status === "CONFIRMED"
        ? "completed"
        : "pending"
      : "completed",
    createdAt: tx.createdAt.toISOString(),
  }));

  return {
    data,
    pagination: { total, limit, offset },
  };
}
