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

redisClient.on("connect", () => {
  logger.info("Redis client connected");
});

redisClient.on("ready", () => {
  logger.info("Redis client ready");
});

redisClient.on("error", (err) => {
  logger.error({ err }, "Redis client error");
});

redisClient.on("reconnecting", () => {
  logger.warn("Redis reconnecting...");
});

export async function connectRedis(): Promise<void> {
  if (redisClient.isOpen) {
    return;
  }

  await redisClient.connect();
}
