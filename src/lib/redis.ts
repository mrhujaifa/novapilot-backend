import { createClient } from "redis";
import { logger } from "./logger";

export const redisClient = createClient({
  url: process.env.REDIS_URL,
});

redisClient.on("error", (err) => {
  logger.error({ err }, "Redis client error");
});

redisClient.on("connect", () => {
  logger.info("Redis client connected");
});

// Call once at server bootstrap (e.g. in your main index.ts before app.listen)
export async function connectRedis(): Promise<void> {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
}
