import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import {
  deductUsage,
  creditDeposit,
  getBalance,
  getUsageHistory,
  getDepositAddress,
  InsufficientBalanceError,
  DuplicateDepositError,
} from "./billing.service";
import {
  deductUsageSchema,
  getBalanceQuerySchema,
  usageHistoryQuerySchema,
} from "./billing.schema";

import { logger } from "../../lib/logger";

export const handleDeductUsage = asyncHandler(async (req: Request, res: Response) => {
  const body = deductUsageSchema.parse(req.body);
  const userId = req.user!.id;

  try {
    const result = await deductUsage({
      userId,
      network: body.network,
      modelPricingId: body.modelPricingId,
      inputTokens: body.inputTokens,
      outputTokens: body.outputTokens,
      idempotencyKey: body.idempotencyKey,
    });
    return successResponse(res, result);
  } catch (error) {
    if (error instanceof InsufficientBalanceError) {
      throw new AppError(StatusCodes.PAYMENT_REQUIRED, error.message);
    }
    throw error;
  }
});

export const handleGetBalance = asyncHandler(async (req: Request, res: Response) => {
  const query = getBalanceQuerySchema.parse(req.query);
  const userId = req.user!.id;

  const amount = await getBalance(userId, query.network);
  return successResponse(res, { amount, network: query.network });
});

export const handleGetUsageHistory = asyncHandler(async (req: Request, res: Response) => {
  const query = usageHistoryQuerySchema.parse(req.query);
  const userId = req.user!.id;

  const result = await getUsageHistory({
    userId,
    network: query.network,
    page: query.page,
    limit: query.limit,
  });
  return successResponse(res, result);
});

import { mapCircleWebhookToDeposit } from "./circle-webhook.mapper";
import { asyncHandler } from "../../utils/asyncHandler";
import { successResponse } from "../../utils/apiResponse";
import { AppError } from "../../utils/AppError";

export const handleGetDepositAddress = asyncHandler(async (req: Request, res: Response) => {
  const query = getBalanceQuerySchema.parse(req.query); // reuse — same shape { network }
  const userId = req.user!.id;

  const address = await getDepositAddress(userId, query.network);
  return successResponse(res, { address, network: query.network });
});

// Assumes Circle signature already verified upstream (verifyCircleWebhook middleware)
export const handleDepositWebhook = asyncHandler(async (req: Request, res: Response) => {
  const { userId, walletId, network, txHash, amount } = await mapCircleWebhookToDeposit(req.body);

  try {
    const result = await creditDeposit({ userId, walletId, network, txHash, amount });
    return successResponse(res, result);
  } catch (error) {
    if (error instanceof DuplicateDepositError) {
      // Webhook retries should be idempotent, not treated as failure
      logger.warn({ err: error }, "Duplicate deposit webhook");
      return successResponse(res, { status: "already_processed" });
    }
    throw error;
  }
});
