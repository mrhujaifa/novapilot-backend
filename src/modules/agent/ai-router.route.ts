import { Router } from "express";
import { handleChat } from "./ai-router.controller";
import { requireAuth } from "../auth/auth.middleware";
import { deductRateLimiter } from "../../middlewares/rateLimiter";

export const aiRouterRouter = Router();

aiRouterRouter.post("/api/chat", requireAuth, deductRateLimiter, handleChat);
