import { Router } from "express";
import { requireAuth } from "./auth.middleware";
import { getMe } from "./auth.controller";
import { authRateLimiter } from "../../middlewares/rateLimiter";

const router = Router();

// GET /api/auth/me
// flow: rate limit -> verify identity + ensure wallet (middleware) -> send response (controller)
router.use("/api/auth/me", authRateLimiter, requireAuth, getMe);

export const AuthRoutes = router;
