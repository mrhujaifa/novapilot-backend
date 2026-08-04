import { createClient, type RedisClientType } from "redis";
import { env } from "../config/env.config";
import { logger } from "./logger";

// Required, not optional — rate limiting depends on Redis being available.
// A silent null fallback here would let rate limiting quietly degrade to
// in-memory (or fail entirely on multi-instance deployments), which is
// worse than failing loudly at boot.
export const redisClient: RedisClientType = createClient({
  url: env.REDIS_URL,
});

redisClient.on("error", (err) => {
  logger.error({ err }, "Redis client error");
});

redisClient.on("connect", () => {
  logger.info("Redis client connected");
});

// Call once at server bootstrap, before app.listen — fails fast if Redis
// is unreachable rather than silently degrading rate-limiting/caching later.
export async function connectRedis(): Promise<void> {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
}
