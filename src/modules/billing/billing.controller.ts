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
import { mapCircleWebhookToDeposit, MappedDeposit } from "./circle-webhook.mapper";
import { asyncHandler } from "../../utils/asyncHandler";
import { successResponse } from "../../utils/apiResponse";
import { AppError } from "../../utils/AppError";
import { logger } from "../../lib/logger";

// Type guard helper
function isSkipped(
  mapped: MappedDeposit | { skipped: true; reason: string },
): mapped is { skipped: true; reason: string } {
  return "skipped" in mapped;
}

// --- Existing handlers ---
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

export const handleGetDepositAddress = asyncHandler(async (req: Request, res: Response) => {
  const query = getBalanceQuerySchema.parse(req.query);
  const userId = req.user!.id;

  const address = await getDepositAddress(userId, query.network);
  return successResponse(res, { address, network: query.network });
});

export const handleDepositWebhook = asyncHandler(async (req: Request, res: Response) => {
  try {
    const result = await mapCircleWebhookToDeposit(req.body);

    if (result.type === "skipped") {
      logger.info({ reason: result.reason }, "Circle webhook skipped");
      return successResponse(res, { status: "ignored", reason: result.reason });
    }

    if (result.type === "sweep_update") {
      return successResponse(res, { status: "sweep_updated" });
    }

    // result.type === "deposit"
    const { userId, walletId, network, txHash, amount } = result.data;
    logger.info({ userId, network, txHash, amount }, "Calling creditDeposit");
    const depositResult = await creditDeposit({ userId, walletId, network, txHash, amount });
    logger.info({ txHash }, "creditDeposit done");
    return successResponse(res, depositResult);
  } catch (error) {
    if (error instanceof DuplicateDepositError) {
      logger.warn({ err: error }, "Duplicate deposit webhook");
      return successResponse(res, { status: "already_processed" });
    }
    logger.error({ err: error }, "Webhook processing failed, but ack to Circle");
    return successResponse(res, { status: "error_logged_internally" });
  }
});
