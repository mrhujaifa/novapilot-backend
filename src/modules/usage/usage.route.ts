import { Router } from "express";

import { getUsageLogs, getUsageSummaryHandler } from "./usage.controller";
import { requireAuth } from "../auth/auth.middleware";

const router = Router();

/**
 * Usage analytics endpoints.
 * All routes require an authenticated user.
 */
router.use(requireAuth);

router.get("/history", getUsageLogs);
router.get("/summary", getUsageSummaryHandler);

export const usageRouter = router;
