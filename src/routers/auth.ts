import { Router, Response } from "express";

import { successResponse } from "../utils/apiResponse";
import { authRateLimiter } from "../middlewares/rateLimiter";
import { AuthenticatedRequest, requireAuth } from "../middlewares/auth";

const router = Router();

// GET /api/auth/me
// flow: rate limit check -> verify Privy token + load user -> send user data back
router.get("/me", authRateLimiter, requireAuth, (req: AuthenticatedRequest, res: Response) => {
  // if requireAuth passed, req.user is guaranteed to exist here
  successResponse(res, { user: req.user });
});

export default router;
