import crypto from "crypto";
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

const subscribeToApi = async (userId: string, slug: string) => {
  // ① API exist করে কিনা check
  const listing = await prisma.apiListing.findUnique({
    where: { apiSlug: slug },
    include: {
      priceVersions: { where: { isCurrent: true } },
    },
  });

  if (!listing || listing.status !== "APPROVED") {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "API not found",
      ErrorCodes.API_NOT_FOUND,
    );
  }

  // ② Already subscribed কিনা check
  const existing = await prisma.marketplaceConsumerKey.findFirst({
    where: {
      userId,
      apiId: listing.id,
      status: "ACTIVE",
    },
  });

  if (existing) {
    throw new AppError(
      StatusCodes.CONFLICT,
      "Already subscribed to this API",
      ErrorCodes.ALREADY_SUBSCRIBED,
    );
  }

  // ③ API key generate করা
  // plaintext শুধু একবার return হবে — DB তে store হবে না
  const rawSecret = crypto.randomBytes(32).toString("hex");
  const keyPrefix = "nvpt_live_";
  const fullKey = `${keyPrefix}${rawSecret}`;

  // SHA-256 hash করে store — plaintext কখনো DB তে যাবে না
  const keyHash = crypto.createHash("sha256").update(fullKey).digest("hex");

  // ④ Transaction — key + subscription একসাথে
  await prisma.$transaction(async (tx) => {
    await tx.marketplaceConsumerKey.create({
      data: {
        userId,
        apiId: listing.id,
        keyHash,
        keyPrefix,
        status: "ACTIVE",
      },
    });

    await tx.apiSubscription.create({
      data: {
        userId,
        apiId: listing.id,
        priceVersionId: listing.priceVersions[0].id,
        status: "ACTIVE",
      },
    });
  });

  // Plaintext key একবারই return — user কে এখনই copy করতে বলতে হবে
  return {
    apiKey: fullKey,
    keyPrefix,
    apiName: listing.apiName,
    proxyEndpointUrl: listing.proxyEndpointUrl,
    warning: "Copy this key now. It will never be shown again.",
  };
};

const unsubscribeFromApi = async (userId: string, slug: string) => {
  // API খুঁজে বের করা
  const listing = await prisma.apiListing.findUnique({
    where: {
      apiSlug: slug,
    },
    select: {
      id: true,
      apiName: true,
    },
  });

  if (!listing) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "API not found",
      ErrorCodes.API_NOT_FOUND,
    );
  }

  // User-এর active subscription খোঁজা
  const subscription = await prisma.apiSubscription.findFirst({
    where: {
      userId,
      apiId: listing.id,
      status: "ACTIVE",
    },
  });

  if (!subscription) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "Active subscription not found",
      ErrorCodes.SUBSCRIPTION_NOT_FOUND,
    );
  }

  // Subscription cancel করা
  const updatedSubscription = await prisma.apiSubscription.update({
    where: {
      id: subscription.id,
    },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
    },
    select: {
      id: true,
      status: true,
      cancelledAt: true,
      api: {
        select: {
          apiName: true,
          apiSlug: true,
        },
      },
    },
  });

  // Consumer key revoke করা
  await prisma.marketplaceConsumerKey.updateMany({
    where: {
      userId,
      apiId: listing.id,
      status: "ACTIVE",
    },
    data: {
      status: "REVOKED",
      revokedAt: new Date(),
    },
  });

  return updatedSubscription;
};

export const consumerService = {
  browseMarketplace,
  getApiBySlug,
  subscribeToApi,
  unsubscribeFromApi,
};
