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
import { listingRouter } from "../modules/marketplace/listing/listing.routes";
import { consumerRouter } from "../modules/marketplace/consumer/consumer.routes";
import { earningRouter } from "../modules/marketplace/earnings/earning.routes";
import { withdrawalRouter } from "../modules/marketplace/withdrawal/withdrawal.routes";
import { marketplaceAdminRouter } from "../modules/marketplace/admin/marketplace-admin.routes";
import { proxyRouter } from "../modules/marketplace/proxy/proxy.routes";

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

// Usage history & analytics
router.use("/usage", usageRouter);

// Marketplace
router.use("/marketplace/creator", creatorRouter);
router.use("/marketplace/creator", listingRouter);
router.use("/marketplace", consumerRouter);
router.use("/marketplace/creator", earningRouter);
router.use("/marketplace/creator", withdrawalRouter);
router.use("/admin/marketplace", marketplaceAdminRouter);
router.use("/v1/marketplace", proxyRouter);
router.use("/v1", publicApiRouter);
router.use("/v1", publicAiRouter);

// Public Ai (session auth)

export const indexRouter = router;
