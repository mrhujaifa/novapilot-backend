import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../errors/AppError";
import { ErrorCodes } from "../../errors/error-codes";
import { hashApiKey, isValidApiKeyFormat } from "./api-key.utils";
import { NetworkEnv } from "../../generated/prisma";
import { logger } from "../../lib/logger";
import { asyncHandler } from "../../utils/asyncHandler";
import { enforceApiKeyRateLimit } from "./api-key.rate-limit";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      apiKeyContext?: {
        apiKeyId: string;
        userId: string;
        network: NetworkEnv;
        spendingLimitUsdc: string | null;
        spentUsdc: string;
      };
    }
  }
}

export const requireApiKey = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      throw new AppError(
        StatusCodes.UNAUTHORIZED,
        "Missing API key. Include it as: Authorization: Bearer npk_...",
        ErrorCodes.API_KEY_MISSING,
      );
    }

    const rawKey = authHeader.slice("Bearer ".length).trim();

    if (!isValidApiKeyFormat(rawKey)) {
      throw new AppError(
        StatusCodes.UNAUTHORIZED,
        "Invalid API key format",
        ErrorCodes.API_KEY_INVALID,
      );
    }

    const keyHash = hashApiKey(rawKey);

    const apiKey = await prisma.apiKey.findUnique({
      where: { keyHash },
      select: {
        id: true,
        userId: true,
        network: true,
        revokedAt: true,
        expiresAt: true,
        spendingLimitUsdc: true,
        spentUsdc: true,
        rateLimitPerMinute: true,
      },
    });

    if (!apiKey) {
      throw new AppError(
        StatusCodes.UNAUTHORIZED,
        "Invalid API key",
        ErrorCodes.API_KEY_INVALID,
      );
    }

    if (apiKey.revokedAt) {
      throw new AppError(
        StatusCodes.UNAUTHORIZED,
        "This API key has been revoked",
        ErrorCodes.API_KEY_REVOKED,
      );
    }

    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      throw new AppError(
        StatusCodes.UNAUTHORIZED,
        "This API key has expired",
        ErrorCodes.API_KEY_EXPIRED,
      );
    }

    if (
      apiKey.spendingLimitUsdc !== null &&
      apiKey.spentUsdc.gte(apiKey.spendingLimitUsdc)
    ) {
      throw new AppError(
        StatusCodes.PAYMENT_REQUIRED,
        "This API key has reached its spending limit",
        ErrorCodes.API_KEY_SPENDING_LIMIT_REACHED,
      );
    }

    await enforceApiKeyRateLimit(apiKey.id, apiKey.rateLimitPerMinute);

    req.apiKeyContext = {
      apiKeyId: apiKey.id,
      userId: apiKey.userId,
      network: apiKey.network,
      spendingLimitUsdc: apiKey.spendingLimitUsdc?.toString() ?? null,
      spentUsdc: apiKey.spentUsdc.toString(),
    };

    prisma.apiKey
      .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
      .catch((err) =>
        logger.error(
          { err, apiKeyId: apiKey.id },
          "Failed to update lastUsedAt",
        ),
      );

    next();
  },
);
