/* eslint-disable @typescript-eslint/no-explicit-any */
import express from "express";
import helmet from "helmet";
import cors from "cors";

import { env } from "./config/env.config";
import { AuthRoutes } from "./modules/auth/auth.routes";
import { billingRouter } from "./modules/billing/billing.route";
import { modelsRouter } from "./modules/models/models.route";
import { globalErrorHandler } from "./errors/global-error-handler";
import { logger } from "./lib/logger";
import { reconcilePendingSettlements } from "./modules/jobs/sweep-reconciliation.job";
import { AiRouters } from "./modules/agent/ai-router.route";
import { walletRoutes } from "./modules/wallet/wallet.routes";

export const app = express();

// Security
app.use(helmet());

app.use(
  cors({
    origin: env.ALLOWED_ORIGINS?.split(",") ?? [],
    credentials: true,
  }),
);

// Billing webhook (needs raw body)
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf; // সব route-এ rawBody থাকবে
    },
  }),
);

// JSON parser
app.use(express.json());
app.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "NovaPilot API is running 🚀",
    version: "1.0.0",
  });
});

setInterval(
  () => {
    reconcilePendingSettlements().catch((err) => {
      logger.error({ err }, "Sweep reconciliation job failed");
    });
  },
  5 * 60 * 1000,
);

// Routes
app.use(AuthRoutes);
app.use("/api/wallet", walletRoutes);
app.use(billingRouter);
app.use(modelsRouter);
app.use("/api/chat", AiRouters);
// Global Error Handler (must be last)
app.use(globalErrorHandler);
