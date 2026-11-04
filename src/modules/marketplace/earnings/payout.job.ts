import { prisma } from "../../../lib/prisma";
import { circleClient } from "../../../lib/circle";
import { env } from "../../../config/env.config";
import { CURRENT_NETWORK } from "../../../config/network.config";
import { logger } from "../../../lib/logger";
import type { CreatorEarningSettlement, CreatorWithdrawal } from "../../../generated/prisma";
import { finalizeUsage } from "../proxy/billing/usage.service";

const failureStates = new Set(["FAILED", "DENIED", "CANCELLED"]);
const leaseCutoff = () => new Date(Date.now() - 120_000);
const errorMessage = (error: unknown) => error instanceof Error ? error.message.slice(0, 500) : "Transfer reconciliation failed";

// Never issue a new transfer key for an ambiguous timeout. Reuse the persisted
// UUID, and poll an existing transaction ID until Circle reports a terminal state.
export async function processCreatorSettlement(row: CreatorEarningSettlement): Promise<void> {
  if (row.network !== CURRENT_NETWORK || !row.usageRecordId) return;
  const claimed = await prisma.creatorEarningSettlement.updateMany({
    where: { id: row.id, updatedAt: row.updatedAt, OR: [{ status: "PENDING" }, { status: "SETTLEMENT_PENDING", updatedAt: { lt: leaseCutoff() } }] },
    data: { status: "SETTLEMENT_PENDING", attempts: { increment: 1 }, lastError: null },
  });
  if (claimed.count !== 1) return;
  try {
    let transferId = row.circleTransferId;
    if (!transferId) {
      const usage = await prisma.marketplaceUsageRecord.findUniqueOrThrow({
        where: { id: row.usageRecordId }, include: { consumerKey: { select: { userId: true } } },
      });
      if (usage.status !== "COMPLETED" || usage.network !== row.network) throw new Error("Settlement usage is not completed on this network");
      const wallet = await prisma.wallet.findUniqueOrThrow({
        where: { userId_network: { userId: usage.consumerKey.userId, network: row.network } },
      });
      const response = await circleClient.createTransaction({
        walletAddress: wallet.address, blockchain: row.network === "MAINNET" ? "ARC" : "ARC-TESTNET",
        tokenAddress: env.USDC_CONTRACT_ADDRESS,
        destinationAddress: env.ADMIN_CIRCLE_WALLET_ADDRESS,
        amount: [usage.finalChargeUsdc.toString()], idempotencyKey: row.idempotencyKey,
        fee: { type: "level", config: { feeLevel: "MEDIUM" } },
      });
      transferId = response.data?.id ?? null;
      if (!transferId) throw new Error("Circle did not return a settlement transaction ID");
      await prisma.creatorEarningSettlement.update({ where: { id: row.id }, data: { circleTransferId: transferId } });
    }
    const response = await circleClient.getTransaction({ id: transferId });
    const transaction = response.data?.transaction;
    if (!transaction) throw new Error("Circle did not return the settlement transaction");
    if (transaction.state === "COMPLETE") {
      await prisma.$transaction(async (tx) => {
        const changed = await tx.creatorEarningSettlement.updateMany({
          where: { id: row.id, status: "SETTLEMENT_PENDING" },
          data: { status: "SETTLED", settledAt: new Date(), txHash: transaction.txHash, lastError: null },
        });
        if (changed.count !== 1) return;
        await tx.creatorProfile.update({ where: { id: row.creatorId }, data: {
          pendingBalanceUsdc: { decrement: row.amountUsdc }, availableBalanceUsdc: { increment: row.amountUsdc },
        } });
      });
    } else if (failureStates.has(transaction.state)) {
      await prisma.$transaction(async (tx) => {
        const changed = await tx.creatorEarningSettlement.updateMany({
          where: { id: row.id, status: "SETTLEMENT_PENDING" },
          data: { status: "FROZEN", lastError: `Circle settlement ${transaction.state}` },
        });
        if (changed.count !== 1) return;
        await tx.creatorProfile.update({ where: { id: row.creatorId }, data: {
          pendingBalanceUsdc: { decrement: row.amountUsdc }, frozenBalanceUsdc: { increment: row.amountUsdc },
        } });
      });
    }
  } catch (error) {
    await prisma.creatorEarningSettlement.update({ where: { id: row.id }, data: { lastError: errorMessage(error) } });
    logger.error({ err: error, settlementId: row.id }, "Marketplace earning settlement needs retry");
  }
}

export async function processCreatorWithdrawal(row: CreatorWithdrawal): Promise<void> {
  if (row.network !== CURRENT_NETWORK) return;
  const claimed = await prisma.creatorWithdrawal.updateMany({
    where: { id: row.id, updatedAt: row.updatedAt, OR: [{ status: "PENDING" }, { status: "PROCESSING", updatedAt: { lt: leaseCutoff() } }] },
    data: { status: "PROCESSING", attempts: { increment: 1 }, lastError: null },
  });
  if (claimed.count !== 1) return;
  try {
    let transferId = row.circleTransferId;
    if (!transferId) {
      const response = await circleClient.createTransaction({
        walletAddress: env.ADMIN_CIRCLE_WALLET_ADDRESS,
        blockchain: row.network === "MAINNET" ? "ARC" : "ARC-TESTNET",
        tokenAddress: env.USDC_CONTRACT_ADDRESS, destinationAddress: row.destinationAddress,
        amount: [row.amountUsdc.toString()], idempotencyKey: row.idempotencyKey,
        fee: { type: "level", config: { feeLevel: "MEDIUM" } },
      });
      transferId = response.data?.id ?? null;
      if (!transferId) throw new Error("Circle did not return a withdrawal transaction ID");
      await prisma.creatorWithdrawal.update({ where: { id: row.id }, data: { circleTransferId: transferId } });
    }
    const response = await circleClient.getTransaction({ id: transferId });
    const transaction = response.data?.transaction;
    if (!transaction) throw new Error("Circle did not return the withdrawal transaction");
    if (transaction.state === "COMPLETE") {
      await prisma.creatorWithdrawal.updateMany({
        where: { id: row.id, status: "PROCESSING" },
        data: { status: "COMPLETED", completedAt: new Date(), txHash: transaction.txHash, lastError: null },
      });
    } else if (failureStates.has(transaction.state)) {
      await prisma.$transaction(async (tx) => {
        const changed = await tx.creatorWithdrawal.updateMany({
          where: { id: row.id, status: "PROCESSING" },
          data: { status: "FAILED", lastError: `Circle withdrawal ${transaction.state}` },
        });
        if (changed.count !== 1) return;
        await tx.creatorProfile.update({ where: { id: row.creatorId }, data: { availableBalanceUsdc: { increment: row.amountUsdc } } });
      });
    }
  } catch (error) {
    await prisma.creatorWithdrawal.update({ where: { id: row.id }, data: { lastError: errorMessage(error) } });
    logger.error({ err: error, withdrawalId: row.id }, "Marketplace withdrawal needs retry");
  }
}

let running = false;
export async function reconcileMarketplacePayouts(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const delivered = await prisma.marketplaceUsageRecord.findMany({
      where: { status: "FORWARDED", network: CURRENT_NETWORK, upstreamStatusCode: { not: null }, latencyMs: { not: null } },
      include: { consumerKey: { select: { userId: true } } }, take: 20, orderBy: { createdAt: "asc" },
    });
    for (const usage of delivered) {
      await finalizeUsage(usage.id, usage.consumerKey.userId, usage.apiId, Number(usage.reservedAmountUsdc), usage.latencyMs!, usage.upstreamStatusCode!);
    }
    const [settlements, withdrawals] = await Promise.all([
      prisma.creatorEarningSettlement.findMany({ where: { network: CURRENT_NETWORK, usageRecordId: { not: null }, OR: [{ status: "PENDING" }, { status: "SETTLEMENT_PENDING", updatedAt: { lt: leaseCutoff() } }] }, orderBy: { createdAt: "asc" }, take: 20 }),
      prisma.creatorWithdrawal.findMany({ where: { network: CURRENT_NETWORK, OR: [{ status: "PENDING" }, { status: "PROCESSING", updatedAt: { lt: leaseCutoff() } }] }, orderBy: { createdAt: "asc" }, take: 20 }),
    ]);
    for (const row of settlements) await processCreatorSettlement(row);
    for (const row of withdrawals) await processCreatorWithdrawal(row);
  } finally {
    running = false;
  }
}
