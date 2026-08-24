import crypto from "crypto";
import { StatusCodes } from "http-status-codes";
import { Request, Response } from "express";
import { prisma } from "../../../lib/prisma";
import { AppError } from "../../../errors/AppError";
import { ErrorCodes } from "../../../errors/error-codes";
import { validateSsrf } from "./security/ssrf.service";
import { applyAuth, AuthSpec } from "./auth-engine";
import { buildRequest, RequestSpec } from "./request-builder";
import { executeHttpRequest } from "./transport/http.transport";
import {
  reserveUsage,
  finalizeUsage,
  refundUsage,
} from "./billing/usage.service";

export const proxyRequest = async (
  req: Request,
  res: Response,
  slug: string,
) => {
  // ① Consumer API key validate
  const authHeader = req.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AppError(
      StatusCodes.UNAUTHORIZED,
      "Missing or invalid API key",
      ErrorCodes.AUTH_UNAUTHORIZED,
    );
  }

  const rawKey = authHeader.slice(7);
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

  const consumerKey = await prisma.marketplaceConsumerKey.findUnique({
    where: { keyHash },
    include: {
      api: {
        include: {
          credentials: { where: { isActive: true } },
          priceVersions: {
            where: { isCurrent: true },
            take: 1,
          },
        },
      },
    },
  });

  if (
    !consumerKey ||
    consumerKey.status !== "ACTIVE" ||
    consumerKey.api.apiSlug !== slug
  ) {
    throw new AppError(
      StatusCodes.UNAUTHORIZED,
      "Invalid API key",
      ErrorCodes.AUTH_UNAUTHORIZED,
    );
  }

  if (consumerKey.api.status !== "APPROVED") {
    throw new AppError(
      StatusCodes.SERVICE_UNAVAILABLE,
      "This API is currently unavailable",
      ErrorCodes.API_NOT_FOUND,
    );
  }

  const priceVersion = consumerKey.api.priceVersions[0];
  if (!priceVersion) {
    throw new AppError(
      StatusCodes.INTERNAL_SERVER_ERROR,
      "API pricing not configured",
      ErrorCodes.API_NOT_FOUND,
    );
  }

  const costPerCall = parseFloat(priceVersion.costPer1kCalls.toString()) / 1000;

  // ② Balance reserve
  let usageRecord;
  try {
    usageRecord = await reserveUsage(
      consumerKey.id,
      consumerKey.userId,
      consumerKey.api.id,
      priceVersion.id,
      consumerKey.api.network,
      costPerCall,
    );
  } catch {
    throw new AppError(
      StatusCodes.PAYMENT_REQUIRED,
      "Insufficient USDC balance",
      ErrorCodes.INSUFFICIENT_BALANCE,
    );
  }

  // ③ Auth apply
  const authSpec = consumerKey.api.authSpec as AuthSpec | null;
  const primaryCredential = consumerKey.api.credentials.find(
    (c) => c.name === (authSpec?.credentialRef ?? "primary"),
  );

  const appliedAuth = applyAuth(
    authSpec,
    primaryCredential?.encryptedData ?? null,
  );

  // ④ Request build
  const requestSpec = consumerKey.api.requestSpec as any;

  const consumerPath = req.params[0] ? `/${req.params[0]}` : "/";

  // SSRF runtime validate
  await validateSsrf(consumerKey.api.targetBaseUrl);

  const builtRequest = buildRequest(
    consumerKey.api.targetBaseUrl,
    requestSpec,
    appliedAuth,
    consumerPath,
    req.query as Record<string, string>,
    req.headers as Record<string, string>,
    req.body,
  );

  // ⑤ Execute
  const startTime = Date.now();

  await new Promise<void>((resolve, reject) => {
    executeHttpRequest(
      builtRequest,
      res,
      async (statusCode, latencyMs) => {
        void finalizeUsage(
          usageRecord.id,
          consumerKey.userId,
          consumerKey.api.id,
          costPerCall,
          latencyMs,
          statusCode,
        );
        resolve();
      },
      async (error) => {
        await refundUsage(usageRecord.id);
        reject(error);
      },
      startTime,
    );
  });
};
