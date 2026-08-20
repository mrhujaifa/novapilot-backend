import { Router } from "express";
import { apiKeyRouter } from "../modules/api/api-key.routes";
import { aiRouter } from "../modules/agent/ai-router.route";
import { authRouter } from "../modules/auth/auth.routes";
import { billingRouter } from "../modules/billing/billing.route";
import { modelsRouter } from "../modules/models/models.route";
import { usageRouter } from "../modules/usage/usage.route";
import { walletRouter } from "../modules/wallet/wallet.routes";
import { publicApiRouter } from "../modules/public/public-api.routes";
import { publicAiRouter } from "../modules/public/public-ai.router";
import { creatorRouter } from "../modules/marketplace/creator/creator.routes";

const router = Router();

// Authentication
router.use("/auth", authRouter);

// Wallet & transactions
router.use("/wallet", walletRouter);

// AI chat
router.use("/chat", aiRouter);

// Available AI models
router.use("/models", modelsRouter);

// Billing & deposits
router.use("/billing", billingRouter);

// User API keys
router.use("/api-keys", apiKeyRouter);

// Public API (API key auth)
router.use("/v1", publicApiRouter);

// Public Ai (session auth)
router.use("/ai", publicAiRouter);

// Usage history & analytics
router.use("/usage", usageRouter);

// Marketplace
router.use("/marketplace/creator", creatorRouter);

export const indexRouter = router;
