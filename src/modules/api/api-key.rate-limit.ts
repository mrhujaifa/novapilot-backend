import { runRedisCommand } from "../../lib/redis";
import { AppError } from "../../errors/AppError";
import { ErrorCodes } from "../../errors/error-codes";
import { StatusCodes } from "http-status-codes";

const DEFAULT_LIMIT_PER_MINUTE = 60; // fallback when the key has no custom override
const WINDOW_SECONDS = 60;
const INCREMENT_WINDOW = `
  local count = redis.call('INCR', KEYS[1])
  if count == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end
  return count
`;

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

  // Set the counter and its expiry atomically: a dropped socket between
  // separate INCR/EXPIRE calls must not leave a permanent rate-limit key.
  const count = await runRedisCommand((client) =>
    client.eval(INCREMENT_WINDOW, {
      keys: [redisKey],
      arguments: [String(WINDOW_SECONDS)],
    }),
  ) as number;

  if (count > limit) {
    throw new AppError(
      StatusCodes.TOO_MANY_REQUESTS,
      "Rate limit exceeded. Please try again later.",
      ErrorCodes.API_KEY_RATE_LIMIT_EXCEEDED,
      { details: { limit, windowSeconds: WINDOW_SECONDS } },
    );
  }
}
