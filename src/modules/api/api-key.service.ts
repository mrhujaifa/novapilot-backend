import { StatusCodes } from "http-status-codes";
import { NetworkEnv } from "../../generated/prisma";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import { generateApiKey } from "./api-key.utils";

// Fields safe to return to the client. Deliberately excludes keyHash —
// even though it's a one-way hash, there's no reason to ever serialize it
// over the wire. This is the single source of truth for "public shape of
// an API key" so every service function returns a consistent object.

const PUBLIC_API_KEY_SELECT = {
  id: true,
  name: true,
  keyPrefix: true,
  network: true,
  spendingLimitUsdc: true,
  spentUsdc: true,
  rateLimitPerMinute: true,
  lastUsedAt: true,
  revokedAt: true,
  expiresAt: true,
  createdAt: true,
} as const;

export interface CreateApiKeyInput {
  userId: string;
  name: string;
  network: NetworkEnv;
  spendingLimitUsdc?: string;
  expiresAt?: Date;
}

export interface CreateApiKeyResult {
  rawKey: string; // shown to the user exactly once
  apiKey: {
    id: string;
    name: string;
    keyPrefix: string; // This for user identify which apikey
    network: NetworkEnv;
    createdAt: Date;
  };
}

/**
 * Creates a new API key for a user. The raw key is generated, hashed for
 * storage, and returned to the caller ONLY in this response — it can
 * never be retrieved again after this point, matching how Stripe/GitHub/
 * OpenAI issue keys.
 */
export async function createApiKey(
  input: CreateApiKeyInput,
): Promise<CreateApiKeyResult> {
  const { userId, name, network, spendingLimitUsdc, expiresAt } = input;

  const { rawKey, keyHash, keyPrefix } = generateApiKey(network);

  const apiKey = await prisma.apiKey.create({
    data: {
      userId,
      name,
      network,
      keyHash,
      keyPrefix,
      spendingLimitUsdc,
      expiresAt,
    },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      network: true,
      createdAt: true,
    },
  });

  return { rawKey, apiKey };
}

/**
 * Lists all API keys for a user, newest first. Never returns keyHash —
 * only display-safe metadata. Used to render the "API Keys" dashboard page.
 */
export async function listApiKeys(userId: string, network: NetworkEnv) {
  return prisma.apiKey.findMany({
    where: { userId, network },
    orderBy: { createdAt: "desc" },
    select: PUBLIC_API_KEY_SELECT,
  });
}

/**
 * Revokes an API key by setting revokedAt. Soft-delete, not a hard
 * delete — preserves the record for audit/usage-history purposes (past
 * UsageLog rows still reference this key). Verifies ownership first so a
 * user can never revoke another user's key by guessing/enumerating IDs.
 */

export async function revokeApiKey(
  apiKeyId: string,
  userId: string,
): Promise<void> {
  const apiKey = await prisma.apiKey.findUnique({
    where: { id: apiKeyId },
    select: { id: true, userId: true, revokedAt: true },
  });

  if (!apiKey) {
    throw new AppError(StatusCodes.NOT_FOUND, "API key not found");
  }
  if (apiKey.userId !== userId) {
    throw new AppError(StatusCodes.FORBIDDEN, "Access denied");
  }
  if (apiKey.revokedAt) {
    // Already revoked — idempotent no-op rather than an error, so a
    // double-click on "Revoke" in the UI doesn't surface a scary error.
    return;
  }

  await prisma.apiKey.update({
    where: { id: apiKeyId },
    data: { revokedAt: new Date() },
  });
}
