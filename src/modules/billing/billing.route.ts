import { Router } from "express";

import {
  handleDeductUsage,
  handleGetBalance,
  handleDepositWebhook,
  handleGetDepositAddress,
} from "./billing.controller";
import { requireAuth } from "../auth/auth.middleware";
import { verifyCircleWebhook } from "../../middlewares/circle-webhook";

const router = Router();

/**
 * Circle webhook endpoint.
 * Protected by webhook signature verification.
 */
router.post("/webhook/deposit", verifyCircleWebhook, handleDepositWebhook);

/**
 * Protected billing endpoints.
 */
router.use(requireAuth);

router.post("/deduct", handleDeductUsage);
router.get("/balance", handleGetBalance);
router.get("/deposit-address", handleGetDepositAddress);

export const billingRouter = router;
