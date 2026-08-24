import crypto from "crypto";
import { prisma } from "../../../../lib/prisma";
import { NetworkEnv } from "../../../../generated/prisma";

export const reserveUsage = async (
  consumerKeyId: string,
  userId: string,
  apiId: string,
  priceVersionId: string,
  network: NetworkEnv,
  costPerCall: number,
) => {
  return prisma.$transaction(async (tx) => {
    const balance = await tx.balance.findFirst({
      where: { userId, network },
    });

    if (!balance) {
      throw new Error("INSUFFICIENT_BALANCE");
    }

    const available =
      parseFloat(balance.amount.toString()) -
      parseFloat(balance.pendingSweepAmount.toString());

    if (available < costPerCall) {
      throw new Error("INSUFFICIENT_BALANCE");
    }

    const requestId = crypto.randomUUID();

    return tx.marketplaceUsageRecord.create({
      data: {
        idempotencyKey: `${consumerKeyId}_${requestId}`,
        consumerKeyId,
        apiId,
        priceVersionId,
        status: "RESERVED",
        reservedAmountUsdc: costPerCall,
        network,
        requestId,
      },
    });
  });
};

export const finalizeUsage = async (
  usageRecordId: string,
  userId: string,
  apiId: string,
  costPerCall: number,
  latencyMs: number,
  upstreamStatus: number,
): Promise<void> => {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.marketplaceUsageRecord.update({
        where: { id: usageRecordId },
        data: {
          status: "COMPLETED",
          finalChargeUsdc: costPerCall,
          latencyMs,
          upstreamStatusCode: upstreamStatus,
        },
      });

      await tx.balance.updateMany({
        where: { userId },
        data: { amount: { decrement: costPerCall } },
      });

      const creatorEarning = costPerCall * 0.98;
      const listing = await tx.apiListing.findUnique({
        where: { id: apiId },
        select: { creatorId: true },
      });

      if (listing) {
        await tx.creatorProfile.update({
          where: { id: listing.creatorId },
          data: {
            pendingBalanceUsdc: { increment: creatorEarning },
            totalCallsServed: { increment: 1 },
          },
        });

        await tx.apiListing.update({
          where: { id: apiId },
          data: { successfulCalls: { increment: 1 } },
        });
      }
    });
  } catch (error) {
    console.error("Billing finalize failed:", error);
  }
};

export const refundUsage = async (usageRecordId: string): Promise<void> => {
  try {
    await prisma.marketplaceUsageRecord.update({
      where: { id: usageRecordId },
      data: { status: "REFUNDED" },
    });
  } catch (error) {
    console.error("Refund failed:", error);
  }
};
