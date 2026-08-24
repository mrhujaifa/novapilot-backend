import crypto from "crypto";
import { isIP } from "net";
import dns from "dns/promises";
import { StatusCodes } from "http-status-codes";
import { prisma } from "../../../lib/prisma";
import { ErrorCodes } from "../../../errors/error-codes";
import { AppError } from "../../../errors/AppError";
import { CreateApiListingInput, UpdateApiListingInput } from "./listing.schema";
import { CredentialType, NetworkEnv } from "../../../generated/prisma";
import { encryptCredential } from "../proxy/auth-engine";
import { validateSsrf } from "../proxy/security/ssrf.service";

const createApiListing = async (
  userId: string,
  input: CreateApiListingInput,
) => {
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

  await validateSsrf(input.targetBaseUrl);

  return prisma.$transaction(async (tx) => {
    const listing = await tx.apiListing.create({
      data: {
        creatorId: creatorProfile.id,
        apiName: input.apiName,
        apiSlug: input.apiSlug,
        description: input.description,
        category: input.category,
        targetBaseUrl: input.targetBaseUrl,
        proxyEndpointUrl: `${process.env.PROXY_BASE_URL}/v1/${input.apiSlug}`,
        requestSpec: input.requestSpec as any,
        authSpec: input.authSpec ?? undefined,
        pricingModel: input.pricingModel,
        status: "PENDING_PING",
        network: process.env.CHAIN_ENV as NetworkEnv,
      },
    });

    // Credential store — auth type অনুযায়ী
    if (input.authSpec && input.authSpec.type !== "none") {
      let credentialData: Record<string, string> = {};

      if (input.authSpec.type === "basic") {
        credentialData = {
          username: input.credentialUsername ?? "",
          password: input.credentialPassword ?? "",
        };
      } else if (input.authSpec.type === "bearer") {
        credentialData = { token: input.credentialValue ?? "" };
      } else {
        credentialData = { value: input.credentialValue ?? "" };
      }

      await tx.apiCredential.create({
        data: {
          apiId: listing.id,
          name: "primary",
          type: mapAuthTypeToCredentialType(
            input.authSpec.type,
          ) as CredentialType,
          encryptedData: encryptCredential(credentialData),
          kmsKeyId: "local",
        },
      });
    }

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

// Auth type → CredentialType enum map
const mapAuthTypeToCredentialType = (authType: string): string => {
  switch (authType) {
    case "bearer":
      return "BEARER";
    case "basic":
      return "BASIC";
    case "custom_header":
      return "CUSTOM";
    default:
      return "API_KEY";
  }
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
