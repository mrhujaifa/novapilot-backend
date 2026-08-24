import crypto from "crypto";
import { StatusCodes } from "http-status-codes";
import { AppError } from "../../../errors/AppError";
import { prisma } from "../../../lib/prisma";
import {
  BrowseMarketplaceQuery,
  MarketplaceUsageQuery,
  UpdateSubscriptionPayload,
} from "./consumer.schema";
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

const updateSubscription = async (
  userId: string,
  slug: string,
  payload: UpdateSubscriptionPayload,
) => {
  const { action } = payload;

  /*
   * Find the API
   */
  const listing = await prisma.apiListing.findUnique({
    where: {
      apiSlug: slug,
    },
    select: {
      id: true,
      apiName: true,
      apiSlug: true,
    },
  });

  if (!listing) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "API not found",
      ErrorCodes.API_NOT_FOUND,
    );
  }

  /*
   * Find the user's subscription
   * We intentionally don't filter by status here.
   * We need to distinguish:
   * ACTIVE  -> PAUSE
   * PAUSED  -> RESUME
   * CANCELLED -> invalid
   */
  const subscription = await prisma.apiSubscription.findUnique({
    where: {
      userId_apiId: {
        userId,
        apiId: listing.id,
      },
    },
    select: {
      id: true,
      status: true,
      startedAt: true,
      pausedAt: true,
      cancelledAt: true,
    },
  });

  if (!subscription) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "Subscription not found",
      ErrorCodes.SUBSCRIPTION_NOT_FOUND,
    );
  }

  /*
   *  Validate state transition
   */
  if (subscription.status === "CANCELLED") {
    throw new AppError(
      StatusCodes.CONFLICT,
      "Cancelled subscriptions cannot be paused or resumed",
      ErrorCodes.SUBSCRIPTION_ALREADY_CANCELLED,
    );
  }

  if (action === "PAUSE" && subscription.status === "PAUSED") {
    throw new AppError(
      StatusCodes.CONFLICT,
      "Subscription is already paused",
      ErrorCodes.SUBSCRIPTION_ALREADY_PAUSED,
    );
  }

  if (action === "RESUME" && subscription.status === "ACTIVE") {
    throw new AppError(
      StatusCodes.CONFLICT,
      "Subscription is already active",
      ErrorCodes.SUBSCRIPTION_ALREADY_ACTIVE,
    );
  }

  /*
   * Atomic state transition
   * Only subscription state changes.
   * Consumer key remains ACTIVE so it can be used again
   * when the subscription is resumed.
   */
  const updatedSubscription = await prisma.$transaction(async (tx) => {
    const updated = await tx.apiSubscription.update({
      where: {
        id: subscription.id,
      },
      data:
        action === "PAUSE"
          ? {
              status: "PAUSED",
              pausedAt: new Date(),
            }
          : {
              status: "ACTIVE",
              pausedAt: null,
            },
      select: {
        id: true,
        status: true,
        startedAt: true,
        pausedAt: true,
        cancelledAt: true,
        updatedAt: true,
        api: {
          select: {
            apiName: true,
            apiSlug: true,
          },
        },
      },
    });

    return updated;
  });

  return updatedSubscription;
};

const getMySubscriptions = async (userId: string) => {
  const subscriptions = await prisma.apiSubscription.findMany({
    where: {
      userId,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      status: true,
      startedAt: true,
      pausedAt: true,
      cancelledAt: true,
      createdAt: true,
      updatedAt: true,

      api: {
        select: {
          id: true,
          apiName: true,
          apiSlug: true,
          description: true,
          category: true,
          proxyEndpointUrl: true,
          pricingModel: true,
          status: true,
          uptimePercent: true,
          avgLatencyMs: true,
          successfulCalls: true,

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
            where: {
              isCurrent: true,
            },
            select: {
              id: true,
              costPer1kCalls: true,
            },
            take: 1,
          },
        },
      },
    },
  });

  return subscriptions;
};

const getMyUsage = async (userId: string, query: MarketplaceUsageQuery) => {
  const { page, limit, apiSlug } = query;

  const skip = (page - 1) * limit;

  const where = {
    consumerKey: {
      userId,
    },

    ...(apiSlug && {
      api: {
        apiSlug,
      },
    }),
  };

  const [records, total] = await Promise.all([
    prisma.marketplaceUsageRecord.findMany({
      where,
      orderBy: [
        {
          createdAt: "desc",
        },
        {
          id: "desc",
        },
      ],
      skip,
      take: limit,

      select: {
        id: true,
        requestId: true,
        status: true,
        reservedAmountUsdc: true,
        finalChargeUsdc: true,
        latencyMs: true,
        upstreamStatusCode: true,
        network: true,
        createdAt: true,

        api: {
          select: {
            id: true,
            apiName: true,
            apiSlug: true,
          },
        },

        priceVersion: {
          select: {
            id: true,
            costPer1kCalls: true,
          },
        },
      },
    }),

    prisma.marketplaceUsageRecord.count({
      where,
    }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    data: records,
    pagination: {
      total,
      page,
      limit,
      totalPages,
    },
  };
};

export const consumerService = {
  browseMarketplace,
  getApiBySlug,
  subscribeToApi,
  unsubscribeFromApi,
  updateSubscription,
  getMySubscriptions,
  getMyUsage,
};
