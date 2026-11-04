import crypto from "crypto";
import { StatusCodes } from "http-status-codes";
import { prisma } from "../../../lib/prisma";
import { AppError } from "../../../errors/AppError";
import { ErrorCodes } from "../../../errors/error-codes";
import { WithdrawalInput } from "./withdrawal.schema";
import Decimal from "decimal.js";
import { CURRENT_NETWORK } from "../../../config/network.config";

const createWithdrawal = async (userId: string, input: WithdrawalInput) => {
  const creatorProfile = await prisma.creatorProfile.findUnique({
    where: { userId },
  });

  if (!creatorProfile) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "Creator profile not found",
      ErrorCodes.CREATOR_PROFILE_NOT_FOUND,
    );
  }

  // Balance check
  const available = new Decimal(creatorProfile.availableBalanceUsdc.toString());
  const amount = new Decimal(input.amountUsdc);

  if (amount.gt(available)) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      `Insufficient balance. Available: ${available} USDC`,
      ErrorCodes.INSUFFICIENT_BALANCE,
    );
  }

  if (amount.lt(1)) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Minimum withdrawal amount is 1 USDC",
      ErrorCodes.INSUFFICIENT_BALANCE,
    );
  }

  const idempotencyKey = crypto.randomUUID();

  // Transaction — balance deduct + withdrawal record
  return prisma.$transaction(async (tx) => {
    // A conditional debit locks this creator row before calculating the
    // network-specific entitlement. A failed check rolls the debit back.
    const debited = await tx.creatorProfile.updateMany({
      where: { id: creatorProfile.id, availableBalanceUsdc: { gte: amount.toString() } },
      data: {
        availableBalanceUsdc: {
          decrement: amount.toString(),
        },
      },
    });
    if (debited.count !== 1) throw new AppError(400, "Insufficient available earnings", ErrorCodes.INSUFFICIENT_BALANCE);
    const [earned, withdrawn] = await Promise.all([
      tx.creatorEarningSettlement.aggregate({ where: { creatorId: creatorProfile.id, network: CURRENT_NETWORK, status: "SETTLED" }, _sum: { amountUsdc: true } }),
      tx.creatorWithdrawal.aggregate({ where: { creatorId: creatorProfile.id, network: CURRENT_NETWORK, status: { in: ["PENDING", "PROCESSING", "COMPLETED"] } }, _sum: { amountUsdc: true } }),
    ]);
    const networkAvailable = new Decimal(earned._sum.amountUsdc?.toString() ?? "0").minus(withdrawn._sum.amountUsdc?.toString() ?? "0");
    if (networkAvailable.lt(amount)) throw new AppError(400, "Insufficient settled earnings on this network", ErrorCodes.INSUFFICIENT_BALANCE);

    return tx.creatorWithdrawal.create({
      data: {
        creatorId: creatorProfile.id,
        amountUsdc: amount.toString(),
        network: CURRENT_NETWORK,
        destinationAddress: input.destinationAddress,
        idempotencyKey,
        status: "PENDING",
      },
    });
  });
};

export const withdrawalService = { createWithdrawal };
