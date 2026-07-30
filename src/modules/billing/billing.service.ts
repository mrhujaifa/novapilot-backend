import { NetworkEnv, Prisma } from "../../generated/prisma/client";
import { logger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { StatusCodes } from "http-status-codes";
import { AppError } from "../../utils/AppError";
import { Decimal } from "../../generated/prisma/runtime/client";
import { GetUsageSummaryInput, UsageSummaryResult } from "./billing.type";

export class InsufficientBalanceError extends AppError {
  constructor(userId: string, required: string, available: string) {
    super(
      StatusCodes.PAYMENT_REQUIRED,
      `Insufficient balance: required ${required}, available ${available}`,
    );

    this.name = "InsufficientBalanceError";
  }
}

export class DuplicateDepositError extends Error {
  constructor(txHash: string) {
    super(`Deposit with txHash ${txHash} already processed`);
    this.name = "DuplicateDepositError";
  }
}

const SWEEP_THRESHOLD_USDC = new Decimal(
  process.env.SWEEP_THRESHOLD_USDC ?? "0.20",
);

interface DeductUsageInput {
  userId: string;
  network: NetworkEnv;
  modelPricingId: string;
  inputTokens: number;
  outputTokens: number;
  idempotencyKey: string;
}

export interface DeductUsageResult {
  usageLogId: string;
  costUsdc: string;
  balanceAfter: string;
  sweepTriggered: boolean;
  sweepAmount?: string;
}

// $queryRaw-এর জন্য আলাদা named type — inline generic object-type ব্যবহার করলে
// tagged-template syntax কখনো কখনো formatter/parser-এ ভেঙে যেতে পারে (এই ফাইলে যেটা হয়েছিল)।
type BalanceRow = {
  id: string;
  amount: Decimal;
  pendingSweepAmount: Decimal;
};
/**
 * AI request-এর token usage থেকে cost calculate করে balance থেকে deduct করে।
 * পুরোটা atomic transaction — balance check, deduct, log, ledger সব একসাথে বা কিছুই না।
 */
export async function deductUsage(
  input: DeductUsageInput,
): Promise<DeductUsageResult> {
  const {
    userId,
    network,
    modelPricingId,
    inputTokens,
    outputTokens,
    idempotencyKey,
  } = input;

  return prisma.$transaction(async (tx) => {
    // ── idempotency check ─────────────────────────────────────────────────
    const existingTx = await tx.transaction.findUnique({
      where: { idempotencyKey },
      include: { usageLog: true },
    });
    if (existingTx?.usageLog) {
      return {
        usageLogId: existingTx.usageLog.id,
        costUsdc: existingTx.usageLog.costUsdc.toString(),
        balanceAfter: existingTx.balanceAfter.toString(),
        sweepTriggered: false, // already processed — no double sweep
      };
    }

    // ── row lock ──────────────────────────────────────────────────────────
    const balanceRows = await tx.$queryRaw<BalanceRow[]>`
      SELECT id, amount, "pendingSweepAmount"
      FROM "Balance"
      WHERE "userId" = ${userId} AND network = ${network}::"NetworkEnv"
      FOR UPDATE
    `;

    if (balanceRows.length === 0) {
      throw new Error(`Balance not found for user ${userId} on ${network}`);
    }
    const balance = balanceRows[0];

    // ── pricing ───────────────────────────────────────────────────────────
    const pricing = await tx.modelPricing.findUniqueOrThrow({
      where: { id: modelPricingId },
      include: { aiModel: true },
    });

    if (!pricing.aiModel.isActive) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "This model is no longer available",
      );
    }
    if (pricing.effectiveTo && pricing.effectiveTo < new Date()) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "Pricing snapshot has expired, refetch current price",
      );
    }

    const inputCost = pricing.inputPricePerM.mul(inputTokens).div(1_000_000);
    const outputCost = pricing.outputPricePerM.mul(outputTokens).div(1_000_000);
    const totalCost = inputCost.add(outputCost);

    if (balance.amount.lessThan(totalCost)) {
      throw new InsufficientBalanceError(
        userId,
        totalCost.toString(),
        balance.amount.toString(),
      );
    }

    // ── sweep threshold check (atomic) ────────────────────────────────────
    const newBalance = balance.amount.sub(totalCost);
    const newPendingSweep = balance.pendingSweepAmount.add(totalCost);
    const shouldSweep = newPendingSweep.gte(SWEEP_THRESHOLD_USDC);

    await tx.balance.update({
      where: { id: balance.id },
      data: {
        amount: newBalance,
        // Reset atomically if sweep fires — prevents double-sweep on next request
        pendingSweepAmount: shouldSweep ? new Decimal(0) : newPendingSweep,
      },
    });

    // ── usage log + ledger tx ─────────────────────────────────────────────
    const usageLog = await tx.usageLog.create({
      data: {
        userId,
        network,
        modelPricingId,
        inputTokens,
        outputTokens,
        costUsdc: totalCost,
      },
    });

    await tx.transaction.create({
      data: {
        userId,
        network,
        type: "DEBIT",
        amountUsdc: totalCost,
        balanceAfter: newBalance,
        usageLogId: usageLog.id,
        idempotencyKey,
      },
    });

    logger.info(
      {
        userId,
        network,
        usageLogId: usageLog.id,
        cost: totalCost.toString(),
        pendingSweep: newPendingSweep.toString(),
        sweepTriggered: shouldSweep,
      },
      "Usage deducted",
    );

    return {
      usageLogId: usageLog.id,
      costUsdc: totalCost.toString(),
      balanceAfter: newBalance.toString(),
      sweepTriggered: shouldSweep,
      sweepAmount: shouldSweep ? newPendingSweep.toString() : undefined,
    };
  });
}

interface CreditDepositInput {
  userId: string;
  walletId: string;
  network: NetworkEnv;
  txHash: string;
  amount: string; // string input, Decimal-এ convert হবে ভেতরে
}

interface CreditDepositResult {
  depositId: string;
  balanceAfter: string;
}

/**
 * Circle webhook থেকে confirmed deposit আসলে balance credit করে।
 * txHash unique constraint দিয়ে duplicate webhook delivery ঠেকানো হয়।
 */
// export async function creditDeposit(input: CreditDepositInput): Promise<CreditDepositResult> {
//   const { userId, walletId, network, txHash, amount } = input;
//   const depositAmount = new Prisma.Decimal(amount);

//   return prisma.$transaction(async (tx) => {
//     // Duplicate check — একই tx hash আগে process হয়ে থাকলে থামিয়ে দেওয়া
//     const existing = await tx.deposit.findUnique({ where: { txHash } });
//     if (existing) {
//       throw new DuplicateDepositError(txHash);
//     }

//     // Balance row lock (upsert না — row না থাকলে সেটা নিজেই একটা bug signal, silent create করব না)
//     const balanceRows = await tx.$queryRaw<BalanceRow[]>`
//       SELECT id, amount FROM "Balance"
//       WHERE "userId" = ${userId} AND network = ${network}::"NetworkEnv"
//       FOR UPDATE
//     `;

//     if (balanceRows.length === 0) {
//       throw new Error(`Balance not found for user ${userId} on ${network}`);
//     }
//     const balance = balanceRows[0];
//     const newBalance = balance.amount.add(depositAmount);

//     const deposit = await tx.deposit.create({
//       data: {
//         userId,
//         walletId,
//         txHash,
//         amount: depositAmount,
//         status: "CONFIRMED",
//         confirmedAt: new Date(),
//       },
//     });

//     await tx.balance.update({
//       where: { id: balance.id },
//       data: { amount: newBalance },
//     });

//     await tx.transaction.create({
//       data: {
//         userId,
//         network,
//         type: "CREDIT",
//         amountUsdc: depositAmount,
//         balanceAfter: newBalance,
//         depositId: deposit.id,
//       },
//     });

//     logger.info(
//       { userId, network, depositId: deposit.id, amount: depositAmount.toString() },
//       "Deposit credited",
//     );

//     return {
//       depositId: deposit.id,
//       balanceAfter: newBalance.toString(),
//     };
//   });
// }

// শুধুমাত্র creditDeposit অংশটা দিচ্ছি, বাকি service ঠিক আছে।
// সম্পূর্ণ ফাইল তুমি আগের মতই রাখবে, শুধু creditDeposit ফাংশনটা বদলে নিচেরটা দেবে।

export async function creditDeposit(
  input: CreditDepositInput,
): Promise<CreditDepositResult> {
  const { userId, walletId, network, txHash, amount } = input;
  const depositAmount = new Prisma.Decimal(amount);

  return prisma.$transaction(async (tx) => {
    // 1) Idempotency / duplicate delivery protection
    const existingDeposit = await tx.deposit.findUnique({ where: { txHash } });
    if (existingDeposit) {
      return {
        depositId: existingDeposit.id,
        balanceAfter: existingDeposit.amount.toString(), // or fetch from transaction/deposit table if needed
      };
    }

    // 2) Ensure balance row exists
    await tx.balance.upsert({
      where: { userId_network: { userId, network } },
      update: {},
      create: {
        userId,
        network,
        amount: 0,
        pendingSweepAmount: 0,
      },
    });

    // 3) Lock the row and re-read it inside the transaction
    const lockedRows = await tx.$queryRaw<BalanceRow[]>`
      SELECT id, amount FROM "Balance"
      WHERE "userId" = ${userId} AND network = ${network}::"NetworkEnv"
      FOR UPDATE
    `;

    if (lockedRows.length === 0) {
      throw new Error(`Balance not found for user ${userId} on ${network}`);
    }

    const balance = lockedRows[0];
    const newBalance = balance.amount.add(depositAmount);

    // 4) Update balance
    await tx.balance.update({
      where: { id: balance.id },
      data: { amount: newBalance },
    });

    // 5) Create deposit
    const deposit = await tx.deposit.create({
      data: {
        userId,
        walletId,
        txHash,
        amount: depositAmount,
        status: "CONFIRMED",
        confirmedAt: new Date(),
      },
    });

    // 6) Create transaction ledger entry
    await tx.transaction.create({
      data: {
        userId,
        network,
        type: "CREDIT",
        amountUsdc: depositAmount,
        balanceAfter: newBalance,
        depositId: deposit.id,
      },
    });

    return {
      depositId: deposit.id,
      balanceAfter: newBalance.toString(),
    };
  });
}
/**
 * Dashboard/balance-check-এর জন্য — শুধু read, lock লাগবে না।
 */
export async function getBalance(
  userId: string,
  network: NetworkEnv,
): Promise<string> {
  const balance = await prisma.balance.findUnique({
    where: { userId_network: { userId, network } },
  });
  return balance ? balance.amount.toString() : "0";
}

/**
 * Returns the user's Circle wallet address for a given network — this is
 * the address they should send USDC to for a deposit.
 */
export async function getDepositAddress(
  userId: string,
  network: NetworkEnv,
): Promise<string> {
  const wallet = await prisma.wallet.findUnique({
    where: { userId_network: { userId, network } },
  });
  if (!wallet) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      `No wallet found for user on ${network}`,
    );
  }
  return wallet.address;
}

interface GetUsageHistoryInput {
  userId: string;
  network: NetworkEnv;
  page: number;
  limit: number;
}

interface UsageHistoryItem {
  id: string;
  modelName: string;
  displayName: string;
  inputTokens: number;
  outputTokens: number;
  costUsdc: string;
  createdAt: Date;
}

interface UsageHistoryResult {
  items: UsageHistoryItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Paginated usage history for the dashboard.
 * Read-only — no locking needed, safe to run outside a transaction.
 */
export async function getUsageHistory(
  input: GetUsageHistoryInput,
): Promise<UsageHistoryResult> {
  const { userId, network, page, limit } = input;
  const skip = (page - 1) * limit;

  const [logs, total] = await Promise.all([
    prisma.usageLog.findMany({
      where: { userId, network },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        modelPricing: {
          include: { aiModel: true },
        },
      },
    }),
    prisma.usageLog.count({ where: { userId, network } }),
  ]);

  return {
    items: logs.map((log) => ({
      id: log.id,
      modelName: log.modelPricing.aiModel.modelName,
      displayName: log.modelPricing.aiModel.displayName,
      inputTokens: log.inputTokens,
      outputTokens: log.outputTokens,
      costUsdc: log.costUsdc.toString(),
      createdAt: log.createdAt,
    })),
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Aggregate usage summary for dashboard stat cards.
 * Read-only, safe outside transaction.
 */
export async function getUsageSummary(
  input: GetUsageSummaryInput,
): Promise<UsageSummaryResult> {
  const { userId, network } = input;

  const result = await prisma.usageLog.aggregate({
    where: { userId, network },
    _count: { id: true },
    _sum: { inputTokens: true, outputTokens: true, costUsdc: true },
  });

  return {
    totalRequests: result._count.id,
    totalInputTokens: result._sum.inputTokens ?? 0,
    totalOutputTokens: result._sum.outputTokens ?? 0,
    totalCostUsdc: (result._sum.costUsdc ?? 0).toString(),
  };
}
