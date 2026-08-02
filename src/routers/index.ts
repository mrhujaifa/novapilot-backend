import { Router } from "express";
import { apiKeyRouter } from "../modules/api/api-key.routes";
import { aiRouter } from "../modules/agent/ai-router.route";
import { authRouter } from "../modules/auth/auth.routes";
import { billingRouter } from "../modules/billing/billing.route";
import { modelsRouter } from "../modules/models/models.route";
import { publicApiRouter } from "../modules/public-api/public-api.routes";
import { usageRouter } from "../modules/usage/usage.route";
import { walletRouter } from "../modules/wallet/wallet.routes";

const router = Router();
router.use("/auth", authRouter);
router.use("/wallet", walletRouter);
router.use("/chat", aiRouter);
router.use("/models", modelsRouter);
router.use("/billing", billingRouter);
router.use("/api-keys", apiKeyRouter);
router.use("/v1", publicApiRouter);
router.use("/usage", usageRouter);

export const indexRouter = router;
