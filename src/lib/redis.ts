import { createClient, type RedisClientType } from "redis";
import { logger } from "./logger";

export const redisClient: RedisClientType | null = process.env.REDIS_URL
  ? createClient({ url: process.env.REDIS_URL })
  : null;

if (redisClient) {
  redisClient.on("error", (err) => {
    logger.error({ err }, "Redis client error");
  });

  redisClient.on("connect", () => {
    logger.info("Redis client connected");
  });
}

// Call once at server bootstrap (e.g. in your main index.ts before app.listen)
export async function connectRedis(): Promise<void> {
  if (!redisClient) {
    return;
  }

  if (!redisClient.isOpen) {
    try {
      await redisClient.connect();
    } catch (err) {
      logger.error({ err }, "Redis connection failed; continuing without Redis");
    }
  }
}
