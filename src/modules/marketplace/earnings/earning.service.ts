import { StatusCodes } from "http-status-codes";
import { prisma } from "../../../lib/prisma";
import { AppError } from "../../../errors/AppError";
import { ErrorCodes } from "../../../errors/error-codes";

const getEarnings = async (userId: string) => {
  const creatorProfile = await prisma.creatorProfile.findUnique({
    where: { userId },
    select: {
      availableBalanceUsdc: true,
      pendingBalanceUsdc: true,
      frozenBalanceUsdc: true,
      totalCallsServed: true,
      withdrawals: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          amountUsdc: true,
          status: true,
          destinationAddress: true,
          createdAt: true,
          completedAt: true,
        },
      },
    },
  });

  if (!creatorProfile) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "Creator profile not found",
      ErrorCodes.CREATOR_PROFILE_NOT_FOUND,
    );
  }

  return creatorProfile;
};

export const earningService = { getEarnings };
