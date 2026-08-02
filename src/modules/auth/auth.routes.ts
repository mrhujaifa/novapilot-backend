import { Router } from "express";

import { getMe } from "./auth.controller";
import { requireAuth } from "./auth.middleware";
import { authRateLimiter } from "../../middlewares/rateLimiter";

const router = Router();

/**
 * Returns the authenticated user's profile.
 * Middleware chain:
 * 1. Rate limiting
 * 2. Authentication
 * 3. Controller
 */
router.get("/me", authRateLimiter, requireAuth, getMe);

export const authRouter = router;
