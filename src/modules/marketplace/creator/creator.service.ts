import { StatusCodes } from "http-status-codes";
import { AppError } from "../../../errors/AppError";
import { prisma } from "../../../lib/prisma";
import { ErrorCodes } from "../../../errors/error-codes";
import {
  CreateCreatorProfileInput,
  UpdateCreatorProfileInput,
} from "./creator.schema";
import { CreatorProfile } from "../../../generated/prisma";

const registerCreatorProfile = async (
  userId: string,
  input: CreateCreatorProfileInput,
): Promise<CreatorProfile> => {
  const existingCreator = await prisma.creatorProfile.findUnique({
    where: { userId },
  });

  if (existingCreator) {
    throw new AppError(
      StatusCodes.CONFLICT,
      "Creator profile already exists",
      ErrorCodes.CREATOR_ALREADY_EXISTS,
    );
  }

  return prisma.creatorProfile.create({
    data: {
      userId,
      ...input,
    },
  });
};

const getCreatorProfile = async (userId: string) => {
  const profile = await prisma.creatorProfile.findUnique({
    where: { userId },
  });

  if (!profile) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "Creator profile not found",
      ErrorCodes.CREATOR_PROFILE_NOT_FOUND,
    );
  }

  return profile;
};

const updateCreatorProfile = async (
  userId: string,
  input: UpdateCreatorProfileInput,
): Promise<CreatorProfile> => {
  const profile = await prisma.creatorProfile.findUnique({
    where: { userId },
  });

  if (!profile) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "Creator profile not found",
      ErrorCodes.CREATOR_PROFILE_NOT_FOUND,
    );
  }

  return prisma.creatorProfile.update({
    where: { userId },
    data: { ...input },
  });
};

const getCreatorAnalytics = async (userId: string) => {
  const creatorProfile = await prisma.creatorProfile.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!creatorProfile) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "Creator profile not found",
      ErrorCodes.CREATOR_PROFILE_NOT_FOUND,
    );
  }

  // Last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [totalCalls, totalEarnings, apiStats] = await Promise.all([
    // Total calls across all APIs
    prisma.apiListing.aggregate({
      where: { creatorId: creatorProfile.id },
      _sum: { successfulCalls: true },
    }),

    // Total earnings
    prisma.creatorProfile.findUnique({
      where: { id: creatorProfile.id },
      select: {
        availableBalanceUsdc: true,
        pendingBalanceUsdc: true,
      },
    }),

    // Per API stats
    prisma.apiListing.findMany({
      where: { creatorId: creatorProfile.id },
      select: {
        id: true,
        apiName: true,
        apiSlug: true,
        status: true,
        successfulCalls: true,
        uptimePercent: true,
        avgLatencyMs: true,
        reportCount: true,
      },
      orderBy: { successfulCalls: "desc" },
    }),
  ]);

  return {
    totalCalls: totalCalls._sum.successfulCalls ?? 0,
    availableBalanceUsdc: totalEarnings?.availableBalanceUsdc ?? "0",
    pendingBalanceUsdc: totalEarnings?.pendingBalanceUsdc ?? "0",
    apiStats,
  };
};

export const creatorService = {
  registerCreatorProfile,
  getCreatorProfile,
  updateCreatorProfile,
  getCreatorAnalytics,
};
