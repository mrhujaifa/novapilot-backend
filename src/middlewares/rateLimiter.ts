import rateLimit from "express-rate-limit";
import { StatusCodes } from "http-status-codes";

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
