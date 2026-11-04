import { createClient, ErrorReply, type RedisClientType } from "redis";
import { env } from "../config/env.config";
import { logger } from "./logger";
import { AppError } from "../errors/AppError";
import { ErrorCodes } from "../errors/error-codes";

// Required, not optional — rate limiting depends on Redis being available.
// A silent null fallback here would let rate limiting quietly degrade to
// in-memory (or fail entirely on multi-instance deployments), which is
// worse than failing loudly at boot.

export const redisClient: RedisClientType = createClient({
  url: env.REDIS_URL,
  // Application-level pings also work when the provider ignores TCP keepalive.
  pingInterval: 30_000,
  socket: {
    connectTimeout: 10_000,
    keepAlive: true,
    keepAliveInitialDelay: 5_000,
    reconnectStrategy: (retries) =>
      Math.min(100 * 2 ** Math.min(retries, 5), 3_000) +
      Math.floor(Math.random() * 100),
  },
  // Never execute a stale billing/rate-limit command after its request fails.
  disableOfflineQueue: true,
  commandOptions: { timeout: 5_000 },
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

const unavailable = (cause?: unknown) =>
  new AppError(
    503,
    "Rate limiting is temporarily unavailable. Please try again shortly.",
    ErrorCodes.SERVICE_UNAVAILABLE,
    { expose: true, cause },
  );

let readyPromise: Promise<void> | undefined;

export async function connectRedis(): Promise<void> {
  if (redisClient.isReady) return;

  // isOpen remains true during reconnects. All callers must await `ready`,
  // and only one caller may initiate the initial socket connection.
  if (!readyPromise) {
    readyPromise = new Promise<void>((resolve, reject) => {
      const finish = (error?: unknown) => {
        clearTimeout(timer);
        redisClient.off("ready", onReady);
        redisClient.off("end", onEnd);
        if (error) reject(unavailable(error));
        else resolve();
      };
      const onReady = () => finish();
      const onEnd = () => finish(new Error("Redis connection closed"));
      const timer = setTimeout(
        () => finish(new Error("Redis readiness timed out")),
        10_000,
      );

      redisClient.once("ready", onReady);
      redisClient.once("end", onEnd);
      if (!redisClient.isOpen) {
        void redisClient.connect().catch(finish);
      }
    }).finally(() => {
      readyPromise = undefined;
    });
  }

  await readyPromise;
}

export async function runRedisCommand<T>(
  command: (client: RedisClientType) => Promise<T>,
): Promise<T> {
  await connectRedis();
  try {
    return await command(redisClient);
  } catch (error) {
    // Preserve server replies, especially NOSCRIPT, so RedisStore can reload
    // its scripts after a Redis restart. Do not replay ambiguous writes.
    if (error instanceof ErrorReply) throw error;
    throw unavailable(error);
  }
}
