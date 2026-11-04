import crypto from "crypto";
import { StatusCodes } from "http-status-codes";
import { AppError } from "../../../errors/AppError";
import { prisma } from "../../../lib/prisma";
import {
  BrowseMarketplaceQuery,
  CreateApiReportPayload,
  MarketplaceUsageQuery,
  UpdateSubscriptionPayload,
} from "./consumer.schema";
import { ErrorCodes } from "../../../errors/error-codes";
import { Prisma } from "../../../generated/prisma/client";
import { proxyEndpointFor } from "../shared/proxy-endpoint";

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
    price: { id: "asc" as const },
    latency: { avgLatencyMs: "asc" as const },
  }[sort ?? "calls"];

  const priceIds = sort === "price" ? await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT a.id FROM "ApiListing" a
    LEFT JOIN LATERAL (
      SELECT "costPer1kCalls" FROM "ApiPriceVersion"
      WHERE "apiId" = a.id AND "isCurrent" = true
      ORDER BY "effectiveFrom" DESC, id DESC LIMIT 1
    ) price ON true
    WHERE a.status = 'APPROVED'
      ${category ? Prisma.sql`AND a.category = ${category}` : Prisma.empty}
      ${search ? Prisma.sql`AND (a."apiName" ILIKE ${`%${search}%`} OR a.description ILIKE ${`%${search}%`})` : Prisma.empty}
    ORDER BY price."costPer1kCalls" ASC NULLS LAST, a.id ASC
    LIMIT ${limit} OFFSET ${(page - 1) * limit}
  `) : undefined;
  const [rows, total] = await Promise.all([
    prisma.apiListing.findMany({
      where: { ...where, ...(priceIds && { id: { in: priceIds.map((row) => row.id) } }) },
      orderBy,
      ...(!priceIds && { skip: (page - 1) * limit, take: limit }),
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
  const data = (priceIds ? priceIds.flatMap(({ id }) => rows.filter((row) => row.id === id)) : rows)
    .map((listing) => ({ ...listing, proxyEndpointUrl: proxyEndpointFor(listing.apiSlug) }));

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

  return { ...listing, proxyEndpointUrl: proxyEndpointFor(listing.apiSlug) };
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
  const priceVersion = listing.priceVersions[0];
  if (!priceVersion) throw new AppError(503, "API pricing is not configured", ErrorCodes.SERVICE_UNAVAILABLE, { expose: true });

  // ③ API key generate করা
  // plaintext শুধু একবার return হবে — DB তে store হবে না
  const rawSecret = crypto.randomBytes(32).toString("hex");
  const keyPrefix = "nvpt_live_";
  const fullKey = `${keyPrefix}${rawSecret}`;

  // SHA-256 hash করে store — plaintext কখনো DB তে যাবে না
  const keyHash = crypto.createHash("sha256").update(fullKey).digest("hex");

  // ④ Transaction — key + subscription একসাথে
  await prisma.$transaction(async (tx) => {
    // Claim the unique subscription row before issuing its key. Concurrent
    // subscribe calls must not each return a valid new credential.
    const subscription = await tx.apiSubscription.upsert({
      where: { userId_apiId: { userId, apiId: listing.id } },
      create: { userId, apiId: listing.id, priceVersionId: priceVersion.id, status: "CANCELLED" },
      update: {},
    });
    const activated = await tx.apiSubscription.updateMany({
      where: { id: subscription.id, status: "CANCELLED" },
      data: { status: "ACTIVE", priceVersionId: priceVersion.id, startedAt: new Date(), pausedAt: null, cancelledAt: null },
    });
    if (activated.count !== 1) throw new AppError(409, "Already subscribed to this API", ErrorCodes.ALREADY_SUBSCRIBED);
    await tx.marketplaceConsumerKey.updateMany({
      where: { userId, apiId: listing.id, status: "ACTIVE" },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    await tx.marketplaceConsumerKey.create({
      data: {
        userId,
        apiId: listing.id,
        keyHash,
        keyPrefix,
        status: "ACTIVE",
      },
    });

  });

  // Plaintext key একবারই return — user কে এখনই copy করতে বলতে হবে
  return {
    apiKey: fullKey,
    keyPrefix,
    apiName: listing.apiName,
    proxyEndpointUrl: proxyEndpointFor(listing.apiSlug),
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
      status: { in: ["ACTIVE", "PAUSED"] },
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
  const updatedSubscription = await prisma.$transaction(async (tx) => {
  const updated = await tx.apiSubscription.update({
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
  await tx.marketplaceConsumerKey.updateMany({
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

  return updated;
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
    const changed = await tx.apiSubscription.updateMany({
      where: {
        id: subscription.id,
        status: subscription.status,
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
    });
    if (changed.count !== 1) throw new AppError(409, "Subscription changed. Please refresh and try again.", ErrorCodes.CONFLICT_ERROR);
    const updated = await tx.apiSubscription.findUniqueOrThrow({
      where: { id: subscription.id },
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

  return subscriptions.map((subscription) => ({
    ...subscription,
    api: { ...subscription.api, proxyEndpointUrl: proxyEndpointFor(subscription.api.apiSlug) },
  }));
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

const reportApi = async (
  userId: string,
  slug: string,
  payload: CreateApiReportPayload,
) => {
  /*
   * Find the API
   * Only approved marketplace APIs can be reported.
   */
  const listing = await prisma.apiListing.findUnique({
    where: {
      apiSlug: slug,
    },
    select: {
      id: true,
      apiName: true,
      apiSlug: true,
      status: true,
      creatorId: true,
    },
  });

  if (!listing || listing.status !== "APPROVED") {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "API not found",
      ErrorCodes.API_NOT_FOUND,
    );
  }

  /*
   * Prevent creator from reporting their own API
   */
  const creator = await prisma.creatorProfile.findUnique({
    where: {
      id: listing.creatorId,
    },
    select: {
      userId: true,
    },
  });

  if (creator?.userId === userId) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "You cannot report your own API",
      ErrorCodes.CANNOT_REPORT_OWN_API,
    );
  }

  /*
   * Create report + increment report counter atomically
   */
  const report = await prisma.$transaction(async (tx) => {
    const createdReport = await tx.apiReport.create({
      data: {
        apiId: listing.id,
        reporterUserId: userId,
        reason: payload.description ? `${payload.reason}: ${payload.description}` : payload.reason,
        evidence: payload.evidence ?? null,

        // Controlled by the system, not the client.
        status: "OPEN",
        riskScore: 0,
      },

      select: {
        id: true,
        apiId: true,
        reporterUserId: true,
        reason: true,
        evidence: true,
        status: true,
        riskScore: true,
        createdAt: true,
      },
    });

    await tx.apiListing.update({
      where: {
        id: listing.id,
      },
      data: {
        reportCount: {
          increment: 1,
        },
      },
    });

    return createdReport;
  });

  return {
    ...report,
    api: {
      apiName: listing.apiName,
      apiSlug: listing.apiSlug,
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
  reportApi,
};
