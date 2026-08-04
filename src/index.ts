/* eslint-disable @typescript-eslint/no-explicit-any */
import express from "express";
import helmet from "helmet";
import cors from "cors";
import { env } from "./config/env.config";
import { globalErrorHandler } from "./errors/global-error-handler";
import { logger } from "./lib/logger";
import { reconcilePendingSettlements } from "./modules/jobs/sweep-reconciliation.job";
import { indexRouter } from "./routers";

export const app = express();

// Security middleware
app.use(helmet());

app.use(
  cors({
    origin: env.ALLOWED_ORIGINS?.split(",") ?? [],
    credentials: true,
  }),
);

// Parse JSON and preserve the raw body for webhook signature verification.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf;
    },
  }),
);

// API status endpoint
app.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "NovaPilot API is running 🚀",
    version: "1.0.0",
  });
});

// Health check endpoint
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// Run background reconciliation every 5 minutes.
setInterval(
  () => {
    reconcilePendingSettlements().catch((err) => {
      logger.error({ err }, "Sweep reconciliation job failed");
    });
  },
  5 * 60 * 1000,
);

// Application routes
app.use("/api", indexRouter);

// Global error handler — must be registered last.
app.use(globalErrorHandler);
