// src/modules/api-keys/api-key.utils.ts

import { randomBytes, createHash } from "crypto";
import { NetworkEnv } from "../../generated/prisma";

const KEY_BYTE_LENGTH = 32; // 256-bit entropy — same strength as a strong session token
const PREFIX_DISPLAY_LENGTH = 12; // "npk_live_" + 3 hex chars, enough to disambiguate in a UI list

/**
 * Generates a new raw API key and its corresponding hash/prefix for storage.
 *
 * The raw key is returned ONLY at creation time — callers must show it to
 * the user once and never persist it anywhere except as a hash. This
 * mirrors how Stripe/GitHub/OpenAI issue API keys: the secret is
 * unrecoverable after the initial display.
 *
 * @param network - determines the key prefix (npk_live_ vs npk_test_), so a
 *   leaked key's environment is immediately obvious just by looking at it.
 */
export function generateApiKey(network: NetworkEnv): {
  rawKey: string;
  keyHash: string;
  keyPrefix: string;
} {
  const envTag = network === "MAINNET" ? "live" : "test";
  const secret = randomBytes(KEY_BYTE_LENGTH).toString("hex");

  const rawKey = `npk_${envTag}_${secret}`;
  const keyHash = hashApiKey(rawKey);
  const keyPrefix = rawKey.slice(0, PREFIX_DISPLAY_LENGTH);

  return { rawKey, keyHash, keyPrefix };
}

/**
 * Hashes a raw API key for storage/lookup comparison.
 *
 * SHA-256 (no salt) is intentional here — unlike a user-chosen password,
 * the raw key is already 256 bits of cryptographically random data, so
 * rainbow-table/brute-force attacks are computationally infeasible even
 * without a salt. This lets us do an indexed equality lookup (keyHash
 * column) instead of the salted-per-row comparison bcrypt would require,
 * which matters for a value checked on every single API request.
 */
export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

/**
 * Validates the basic shape of a raw API key before attempting a DB
 * lookup — cheap short-circuit for obviously malformed input (e.g. a
 * random string sent by a bot scanning for endpoints).
 */
export function isValidApiKeyFormat(rawKey: string): boolean {
  return /^npk_(live|test)_[a-f0-9]{64}$/.test(rawKey);
}
