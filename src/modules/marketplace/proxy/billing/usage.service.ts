import crypto from "crypto";
import Decimal from "decimal.js";
import { prisma } from "../../../../lib/prisma";
import { NetworkEnv } from "../../../../generated/prisma";
import { AppError } from "../../../../errors/AppError";
import { ErrorCodes } from "../../../../errors/error-codes";

const PREPAID_PREFIX = "marketplace:reserved:";
const insufficient = () => new AppError(402, "Insufficient USDC balance", ErrorCodes.INSUFFICIENT_BALANCE);

export const reserveUsage = async (
  consumerKeyId: string, userId: string, apiId: string,
  priceVersionId: string, network: NetworkEnv, costPerCall: number,
) => prisma.$transaction(async (tx) => {
  // Balances use six decimals; reserve a whole micro-USDC for smaller prices.
  const charge = new Decimal(costPerCall).toDecimalPlaces(6, Decimal.ROUND_CEIL);
  const balances = await tx.$queryRaw<Array<{ id: string; amount: Decimal; pendingSweepAmount: Decimal }>>`
    SELECT id, amount, "pendingSweepAmount" FROM "Balance"
    WHERE "userId" = ${userId} AND network = ${network}::"NetworkEnv"
    FOR UPDATE
  `;
  const balance = balances[0];
  if (!balance || new Decimal(balance.amount).minus(balance.pendingSweepAmount).lt(charge)) throw insufficient();
  await tx.balance.update({ where: { id: balance.id }, data: { amount: { decrement: charge.toString() } } });
  const requestId = crypto.randomUUID();
  return tx.marketplaceUsageRecord.create({ data: {
    idempotencyKey: `${PREPAID_PREFIX}${requestId}`,
    consumerKeyId, apiId, priceVersionId, network, requestId,
    status: "RESERVED", reservedAmountUsdc: charge.toString(),
  } });
});

export const finalizeUsage = async (
  usageRecordId: string, userId: string, apiId: string,
  _costPerCall: number, latencyMs: number, upstreamStatus: number,
): Promise<void> => {
  await prisma.$transaction(async (tx) => {
    const usage = await tx.marketplaceUsageRecord.findUniqueOrThrow({ where: { id: usageRecordId } });
    if (usage.status !== "RESERVED" && usage.status !== "FORWARDED") return;
    const charge = usage.reservedAmountUsdc;
    const claimed = await tx.marketplaceUsageRecord.updateMany({
      where: { id: usageRecordId, status: { in: ["RESERVED", "FORWARDED"] } },
      data: { status: "COMPLETED", finalChargeUsdc: charge, latencyMs, upstreamStatusCode: upstreamStatus },
    });
    if (claimed.count !== 1) return;
    // Older reservations were not debited when they were created.
    if (!usage.idempotencyKey.startsWith(PREPAID_PREFIX)) {
      const debited = await tx.balance.updateMany({
        where: { userId, network: usage.network, amount: { gte: charge } },
        data: { amount: { decrement: charge } },
      });
      if (debited.count !== 1) throw insufficient();
    }
    const listing = await tx.apiListing.findUniqueOrThrow({ where: { id: apiId }, select: { creatorId: true } });
    const earning = new Decimal(charge.toString()).mul("0.98").toDecimalPlaces(6, Decimal.ROUND_DOWN);
    await tx.creatorProfile.update({ where: { id: listing.creatorId }, data: {
      pendingBalanceUsdc: { increment: earning.toString() }, totalCallsServed: { increment: 1 },
    } });
    await tx.creatorEarningSettlement.create({ data: {
      creatorId: listing.creatorId, usageRecordId, network: usage.network,
      amountUsdc: earning.toString(), idempotencyKey: crypto.randomUUID(), status: "PENDING",
    } });
    await tx.apiListing.update({ where: { id: apiId }, data: { successfulCalls: { increment: 1 } } });
  });
};

export const refundUsage = async (usageRecordId: string): Promise<void> => {
  await prisma.$transaction(async (tx) => {
    const usage = await tx.marketplaceUsageRecord.findUniqueOrThrow({
      where: { id: usageRecordId }, include: { consumerKey: { select: { userId: true } } },
    });
    const claimed = await tx.marketplaceUsageRecord.updateMany({
      where: { id: usageRecordId, status: "RESERVED" }, data: { status: "REFUNDED" },
    });
    if (claimed.count !== 1 || !usage.idempotencyKey.startsWith(PREPAID_PREFIX)) return;
    await tx.balance.update({
      where: { userId_network: { userId: usage.consumerKey.userId, network: usage.network } },
      data: { amount: { increment: usage.reservedAmountUsdc } },
    });
  });
};
