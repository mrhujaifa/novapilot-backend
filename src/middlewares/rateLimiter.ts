import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { StatusCodes } from "http-status-codes";
import RedisStore from "rate-limit-redis";
import { redisClient } from "../lib/redis";

// Limits requests per IP — prevents anyone from spamming the auth endpoint.
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,

  // Custom handler so the response shape matches the rest of the API's error format.
  handler: (req, res) => {
    res.status(StatusCodes.TOO_MANY_REQUESTS).json({
      success: false,
      status: StatusCodes.TOO_MANY_REQUESTS,
      message: "Too many requests, please try again later",
    });
  },
});

// Scoped to the authenticated user, not IP — one wallet shouldn't be able
// to starve other users' quota, and a shared NAT/IP shouldn't rate-limit
// unrelated users.
const redisStore = new RedisStore({
  sendCommand: async (...args: string[]) => {
    if (!redisClient!.isOpen) {
      await redisClient!.connect();
    }
    return redisClient!.sendCommand(args);
  },
  prefix: "rl:billing:deduct:",
});

export const deductRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // max 60 deduct calls per user per minute
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? ipKeyGenerator(req.ip ?? ""),
  store: redisStore,
  message: {
    success: false,
    status: 429,
    message: "Too many billing requests, slow down",
  },
});
