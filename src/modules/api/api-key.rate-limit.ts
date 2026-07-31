import { redisClient } from "../../lib/redis";
import { AppError } from "../../utils/AppError";
import { StatusCodes } from "http-status-codes";

const DEFAULT_LIMIT_PER_MINUTE = 60; // fallback when the key has no custom override
const WINDOW_SECONDS = 60;

/**
 * Fixed-window rate limiter keyed per API key. Uses Redis INCR (atomic)
 * + EXPIRE to implement a simple, cheap counter that resets every 60s.
 *
 * A fixed window (vs. sliding log) is intentional here: O(1) memory and
 * one round-trip per check, which matters since this runs on every public
 * API request. The trade-off — slight burst tolerance at window boundaries
 * — is acceptable for this use case (abuse prevention, not billing-grade
 * precision; billing itself is enforced separately via spendingLimitUsdc).
 */
export async function enforceApiKeyRateLimit(
  apiKeyId: string,
  limitPerMinute: number | null,
): Promise<void> {
  const limit = limitPerMinute ?? DEFAULT_LIMIT_PER_MINUTE;
  const redisKey = `ratelimit:apikey:${apiKeyId}`;

  const count = await redisClient?.incr(redisKey);

  // Only set TTL on the first request in this window — subsequent INCRs
  // must not reset the expiry, or the window would never close.
  if (count === 1) {
    await redisClient?.expire(redisKey, WINDOW_SECONDS);
  }

  if (count! > limit) {
    throw new AppError(
      StatusCodes.TOO_MANY_REQUESTS,
      `Rate limit exceeded: ${limit} requests per minute for this API key.`,
    );
  }
}
