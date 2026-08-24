import { StatusCodes } from "http-status-codes";
import { prisma } from "../../../lib/prisma";
import { AppError } from "../../../errors/AppError";
import { ErrorCodes } from "../../../errors/error-codes";

const getPendingApis = async () => {
  return prisma.apiListing.findMany({
    where: {
      status: "PENDING_PING",
    },
    include: {
      creator: {
        select: {
          displayName: true,
          country: true,
          isVerified: true,
          user: {
            select: { wallets: true },
          },
        },
      },
      priceVersions: {
        where: { isCurrent: true },
        select: { costPer1kCalls: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
};

const updateApiStatus = async (
  apiId: string,
  status: "APPROVED" | "SUSPENDED" | "BANNED",
) => {
  const listing = await prisma.apiListing.findUnique({
    where: { id: apiId },
  });

  if (!listing) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "API not found",
      ErrorCodes.API_NOT_FOUND,
    );
  }

  return prisma.apiListing.update({
    where: { id: apiId },
    data: { status },
  });
};

const verifyCreator = async (creatorId: string) => {
  return prisma.creatorProfile.update({
    where: { id: creatorId },
    data: {
      isVerified: true,
      verifiedAt: new Date(),
    },
  });
};

export const marketplaceAdminService = {
  getPendingApis,
  updateApiStatus,
  verifyCreator,
};
