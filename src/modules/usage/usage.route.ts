import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware";
import { getUsageLogs, getUsageSummaryHandler } from "./usage.controller";

const router = Router();

router.get("/api/usage/usage-history", requireAuth, getUsageLogs);

router.get("/api/usage/usage-summary", requireAuth, getUsageSummaryHandler);

export const UsageRoutes = router;
