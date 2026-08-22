import crypto from "crypto";
import { isIP } from "net";
import dns from "dns/promises";
import { StatusCodes } from "http-status-codes";
import { prisma } from "../../../lib/prisma";
import { ErrorCodes } from "../../../errors/error-codes";
import { AppError } from "../../../errors/AppError";
import { CreateApiListingInput, UpdateApiListingInput } from "./listing.schema";
import { NetworkEnv } from "../../../generated/prisma";

// Encrypting the creator's secret header with AES-256-CBC
const encryptSecret = (value: string): string => {
  const key = Buffer.from(process.env.ENCRYPTION_KEY!, "hex");
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
};

// Private IP ranges are being blocked to prevent SSRF attacks
const validateSsrf = async (url: string): Promise<void> => {
  const parsed = new URL(url);
  const hostname = parsed.hostname;

  const privateRanges = [
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^169\.254\./,
    /^::1$/,
  ];

  if (isIP(hostname)) {
    if (privateRanges.some((r) => r.test(hostname))) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "Private IP addresses are not allowed",
        ErrorCodes.SSRF_BLOCKED,
      );
    }
  }

  // DNS resolve final IP check — DNS rebinding attack prevention
  const addresses = await dns.resolve4(hostname).catch(() => []);
  for (const addr of addresses) {
    if (privateRanges.some((r) => r.test(addr))) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "Target URL resolves to a private IP address",
        ErrorCodes.SSRF_BLOCKED,
      );
    }
  }
};

const createApiListing = async (
  userId: string,
  input: CreateApiListingInput,
) => {
  //  Creator profile check
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

  //  Slug unique check
  const existingSlug = await prisma.apiListing.findUnique({
    where: { apiSlug: input.apiSlug },
  });

  if (existingSlug) {
    throw new AppError(
      StatusCodes.CONFLICT,
      "API slug already exists",
      ErrorCodes.SLUG_ALREADY_EXISTS,
    );
  }

  //  SSRF validation
  await validateSsrf(input.targetOriginUrl);

  // create listing api information
  return prisma.$transaction(async (tx) => {
    const listing = await tx.apiListing.create({
      data: {
        creatorId: creatorProfile.id,
        apiName: input.apiName,
        apiSlug: input.apiSlug,
        description: input.description,
        category: input.category,
        targetOriginUrl: input.targetOriginUrl,
        proxyEndpointUrl: `${process.env.PROXY_BASE_URL}/v1/${input.apiSlug}`,
        pricingModel: input.pricingModel,
        status: "PENDING_PING",
        network: process.env.CHAIN_ENV as NetworkEnv,
      },
    });

    await tx.apiCredential.create({
      data: {
        apiId: listing.id,
        headerName: input.headerName,
        encryptedHeaderValue: encryptSecret(input.headerValue),
        kmsKeyId: "local",
      },
    });

    await tx.apiPriceVersion.create({
      data: {
        apiId: listing.id,
        costPer1kCalls: input.costPer1kCalls,
        isCurrent: true,
      },
    });

    return listing;
  });
};

const getApiListing = async (userId: string) => {
  //  Creator profile check
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

  const result = await prisma.apiListing.findMany({
    where: {
      creatorId: creatorProfile.id,
    },

    include: {
      priceVersions: {
        where: { isCurrent: true },
      },
    },
  });

  return result;
};

const getApiListingById = async (userId: string, apiId: string) => {
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

  const listing = await prisma.apiListing.findUnique({
    where: { id: apiId },
    include: {
      priceVersions: { where: { isCurrent: true } },
    },
  });

  if (!listing) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "API not found",
      ErrorCodes.API_NOT_FOUND,
    );
  }

  if (listing.creatorId !== creatorProfile.id) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "Access denied",
      ErrorCodes.AUTH_FORBIDDEN,
    );
  }

  return listing;
};

export const listingService = {
  createApiListing,
  getApiListing,
  getApiListingById,
};
