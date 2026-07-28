import { Prisma } from "../../generated/prisma/client";
import { TransactionType } from "../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import type { TransactionQuery } from "./wallet.dto";

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
