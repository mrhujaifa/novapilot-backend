import crypto from "crypto";
import { StatusCodes } from "http-status-codes";
import { prisma } from "../../../lib/prisma";
import { AppError } from "../../../errors/AppError";
import { ErrorCodes } from "../../../errors/error-codes";
import { WithdrawalInput } from "./withdrawal.schema";

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
  const available = parseFloat(creatorProfile.availableBalanceUsdc.toString());
  const amount = parseFloat(input.amountUsdc.toString());

  if (amount > available) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      `Insufficient balance. Available: ${available} USDC`,
      ErrorCodes.INSUFFICIENT_BALANCE,
    );
  }

  if (amount < 1) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Minimum withdrawal amount is 1 USDC",
      ErrorCodes.INSUFFICIENT_BALANCE,
    );
  }

  const idempotencyKey = crypto.randomUUID();

  // Transaction — balance deduct + withdrawal record
  return prisma.$transaction(async (tx) => {
    await tx.creatorProfile.update({
      where: { id: creatorProfile.id },
      data: {
        availableBalanceUsdc: {
          decrement: amount,
        },
      },
    });

    return tx.creatorWithdrawal.create({
      data: {
        creatorId: creatorProfile.id,
        amountUsdc: amount,
        destinationAddress: input.destinationAddress,
        idempotencyKey,
        status: "PENDING",
      },
    });
  });
};

export const withdrawalService = { createWithdrawal };
