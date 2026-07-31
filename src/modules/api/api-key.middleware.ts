// src/modules/api-keys/api-key.middleware.ts

import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import { hashApiKey, isValidApiKeyFormat } from "./api-key.utils";
import { NetworkEnv } from "../../generated/prisma";
import { logger } from "../../lib/logger";
import { asyncHandler } from "../../utils/asyncHandler";
import { enforceApiKeyRateLimit } from "./api-key.rate-limit";

// Augment Express's Request type so downstream handlers get typed access
// to the resolved API-key context, separate from req.user (which is only
// populated for Privy session-based requests).
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

/**
 * Authenticates requests to the public API surface (/v1/*) using an
 * API key instead of a Privy session cookie. This is the entry point
 * external integrations (Discord bots, VS Code extensions, etc.) use —
 * they never have a browser session, only a long-lived key.
 *
 * On success, attaches req.apiKeyContext for downstream handlers
 * (billing, model routing) to consume.
 */
export const requireApiKey = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      throw new AppError(
        StatusCodes.UNAUTHORIZED,
        "Missing API key. Include it as: Authorization: Bearer npk_...",
      );
    }

    const rawKey = authHeader.slice("Bearer ".length).trim();

    // Cheap format check before hitting the DB — rejects obviously
    // malformed keys (typos, random strings from bots) without a query.
    if (!isValidApiKeyFormat(rawKey)) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "Invalid API key format");
    }

    const keyHash = hashApiKey(rawKey);

    // Indexed equality lookup on keyHash (unique index) — O(1), not a
    // table scan. This is the only DB round-trip needed to resolve identity.
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
      throw new AppError(StatusCodes.UNAUTHORIZED, "Invalid API key");
    }

    if (apiKey.revokedAt) {
      throw new AppError(
        StatusCodes.UNAUTHORIZED,
        "This API key has been revoked",
      );
    }

    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "This API key has expired");
    }

    if (
      apiKey.spendingLimitUsdc !== null &&
      apiKey.spentUsdc.gte(apiKey.spendingLimitUsdc)
    ) {
      throw new AppError(
        StatusCodes.PAYMENT_REQUIRED,
        "This API key has reached its spending limit",
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

    // Fire-and-forget — updating lastUsedAt is observability, not
    // correctness-critical. Awaiting it would add latency to every public
    // API request for no user-facing benefit. Errors are logged, not
    // thrown, so a transient DB hiccup here never breaks the actual request.
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
