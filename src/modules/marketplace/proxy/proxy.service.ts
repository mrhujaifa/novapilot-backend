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
import { logger } from "../../../lib/logger";
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

  const subscription = await prisma.apiSubscription.findUnique({
    where: { userId_apiId: { userId: consumerKey.userId, apiId: consumerKey.api.id } },
    select: { status: true },
  });
  if (subscription?.status !== "ACTIVE") {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "An active subscription is required to call this API",
      ErrorCodes.AUTH_FORBIDDEN,
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
  const requestSpec = consumerKey.api.requestSpec as unknown as RequestSpec;

  const path = req.params.path;
  const consumerPath = `/${Array.isArray(path) ? path.join("/") : path ?? ""}`;

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

  const usageRecord = await reserveUsage(
    consumerKey.id, consumerKey.userId, consumerKey.api.id,
    priceVersion.id, consumerKey.api.network, costPerCall,
  );

  // ⑤ Execute
  const startTime = Date.now();

  let response: { statusCode: number; latencyMs: number };
  try {
    response = await new Promise<{ statusCode: number; latencyMs: number }>((resolve, reject) => {
      executeHttpRequest(
        builtRequest, res,
        (statusCode, latencyMs) => resolve({ statusCode, latencyMs }),
        reject, startTime,
      );
    });
  } catch (error) {
    await refundUsage(usageRecord.id);
    throw error;
  }
  try {
    await prisma.marketplaceUsageRecord.update({ where: { id: usageRecord.id }, data: {
      status: "FORWARDED", upstreamStatusCode: response.statusCode, latencyMs: response.latencyMs,
    } });
    await finalizeUsage(
      usageRecord.id, consumerKey.userId, consumerKey.api.id,
      costPerCall, response.latencyMs, response.statusCode,
    );
  } catch (error) {
    // The upstream response has already been streamed. Preserve the debit
    // for reconciliation rather than refunding a successfully delivered call.
    logger.error({ err: error, usageRecordId: usageRecord.id }, "Marketplace billing finalization failed");
    throw error;
  }
};
