import { Router } from "express";
import {
  handleDeductUsage,
  handleGetBalance,
  handleDepositWebhook,
  handleGetDepositAddress,
} from "./billing.controller";
import { requireAuth } from "../auth/auth.middleware";
import { verifyCircleWebhook } from "../../middlewares/circle-webhook";

export const billingRouter = Router();

billingRouter.post("/api/billing/deduct", requireAuth, handleDeductUsage);
billingRouter.get("/api/billing/balance", requireAuth, handleGetBalance);
billingRouter.post(
  "/api/billing/webhook/deposit",
  verifyCircleWebhook,
  handleDepositWebhook,
);
billingRouter.get(
  "/api/billing/deposit-address",
  requireAuth,
  handleGetDepositAddress,
);
