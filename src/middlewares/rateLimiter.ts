import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { StatusCodes } from "http-status-codes";
import RedisStore from "rate-limit-redis";
import { redisClient } from "../lib/redis";

// limit request per IP, so no one can spam the auth endpoint
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // time window: 15 minutes
  max: 30, // max 30 requests allowed per IP in this window
  standardHeaders: true, // send rate limit info in standard RateLimit-* headers
  legacyHeaders: false, // disable old X-RateLimit-* headers

  // custom handler so response shape matches our other error responses
  handler: (req, res) => {
    res.status(StatusCodes.TOO_MANY_REQUESTS).json({
      success: false,
      status: StatusCodes.TOO_MANY_REQUESTS,
      message: "Too many requests, please try again later",
    });
  },
});

// Scoped to authenticated user, not IP — one wallet shouldn't be able to
// starve other users' quota, and a shared NAT/IP shouldn't rate-limit unrelated users.
// const ensureRedisConnected = async () => {
//   if (!redisClient) {
//     return;
//   }

//   if (!redisClient.isOpen) {
//     await redisClient.connect();
//   }
// };

const client = redisClient;

const redisStore = client
  ? new RedisStore({
      sendCommand: async (...args: string[]) => {
        if (!client.isOpen) {
          await client.connect();
        }

        return client.sendCommand(args);
      },
      prefix: "rl:billing:deduct:",
    })
  : undefined;

export const deductRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // max 60 deduct calls per user per minute
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? ipKeyGenerator(req.ip ?? ""),
  store: redisStore,
  message: { success: false, status: 429, message: "Too many billing requests, slow down" },
});
