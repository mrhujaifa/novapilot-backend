import { StatusCodes } from "http-status-codes";
import { AppError } from "../../../errors/AppError";
import { prisma } from "../../../lib/prisma";
import { BrowseMarketplaceQuery } from "./consumer.schema";
import { ErrorCodes } from "../../../errors/error-codes";

const browseMarketplace = async (query: BrowseMarketplaceQuery) => {
  const { search, category, sort, page, limit } = query;

  const where = {
    status: "APPROVED" as const,
    ...(search && {
      OR: [
        { apiName: { contains: search, mode: "insensitive" as const } },
        { description: { contains: search, mode: "insensitive" as const } },
      ],
    }),
    ...(category && { category }),
  };

  // sort field map করা হচ্ছে — user input directly DB field এ use করা যাবে না
  const orderBy = {
    calls: { successfulCalls: "desc" as const },
    price: { priceVersions: { _count: "asc" as const } },
    latency: { avgLatencyMs: "asc" as const },
  }[sort ?? "calls"];

  const [data, total] = await Promise.all([
    prisma.apiListing.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        priceVersions: {
          where: { isCurrent: true },
          select: { costPer1kCalls: true },
        },
        // Creator এর basic info দেখাবে — sensitive data না
        creator: {
          select: {
            displayName: true,
            country: true,
            isVerified: true,
            avatarUrl: true,
          },
        },
      },
    }),
    prisma.apiListing.count({ where }),
  ]);

  return {
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const getApiBySlug = async (slug: string) => {
  const listing = await prisma.apiListing.findUnique({
    where: { apiSlug: slug },
    include: {
      creator: {
        select: {
          displayName: true,
          country: true,
          isVerified: true,
          avatarUrl: true,
          companyName: true,
        },
      },
      priceVersions: {
        where: { isCurrent: true },
        select: { costPer1kCalls: true },
      },
    },
  });

  if (!listing) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "API not found",
      ErrorCodes.API_NOT_FOUND,
    );
  }

  if (listing.status !== "APPROVED") {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "API not found",
      ErrorCodes.API_NOT_FOUND,
    );
  }

  return listing;
};

export const consumerService = {
  browseMarketplace,
  getApiBySlug,
};
