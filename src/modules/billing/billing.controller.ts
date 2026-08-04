import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import {
  deductUsage,
  creditDeposit,
  getBalance,
  getDepositAddress,
  DuplicateDepositError,
} from "./billing.service";
import {
  deductUsageSchema,
  getBalanceQuerySchema,
  usageHistoryQuerySchema,
} from "./billing.schema";
import { mapCircleWebhookToDeposit } from "../webhook/circle-webhook.mapper";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendApiResponse } from "../../utils/sendApiResponse";
import { logger } from "../../lib/logger";
import { AppError } from "../../errors/AppError";
import { ErrorCodes } from "../../errors/error-codes";

export const handleDeductUsage = asyncHandler(
  async (req: Request, res: Response) => {
    const body = deductUsageSchema.parse(req.body);

    if (!req.user) {
      throw new AppError(
        StatusCodes.UNAUTHORIZED,
        "Authentication required",
        ErrorCodes.AUTH_UNAUTHORIZED,
      );
    }

    const userId = req.user.id;

    // No try/catch needed — InsufficientBalanceError extends AppError, so
    // globalErrorHandler picks it up directly with its own status + code intact.
    const result = await deductUsage({
      userId,
      network: body.network,
      modelPricingId: body.modelPricingId,
      inputTokens: body.inputTokens,
      outputTokens: body.outputTokens,
      idempotencyKey: body.idempotencyKey,
    });

    sendApiResponse(res, {
      httpStatusCode: StatusCodes.OK,
      success: true,
      message: "Usage deducted successfully",
      data: result,
    });
  },
);

export const handleGetBalance = asyncHandler(
  async (req: Request, res: Response) => {
    const query = getBalanceQuerySchema.parse(req.query);
    const userId = req.user!.id;

    const amount = await getBalance(userId, query.network);

    sendApiResponse(res, {
      httpStatusCode: StatusCodes.OK,
      success: true,
      message: "Balance retrieved successfully",
      data: { amount, network: query.network },
    });
  },
);

export const handleGetDepositAddress = asyncHandler(
  async (req: Request, res: Response) => {
    const query = getBalanceQuerySchema.parse(req.query);
    const userId = req.user!.id;

    const address = await getDepositAddress(userId, query.network);

    sendApiResponse(res, {
      httpStatusCode: StatusCodes.OK,
      success: true,
      message: "Deposit address retrieved successfully",
      data: { address, network: query.network },
    });
  },
);

/**
 * Circle webhook receiver. Always acknowledges with 200 — Circle retries
 * on any non-2xx response, so a transient internal error here would
 * otherwise trigger a retry storm. Failures are logged loudly instead;
 * the response body still reports what actually happened for our own
 * debugging/monitoring, it just never uses a failure HTTP status.
 */
export const handleDepositWebhook = asyncHandler(
  async (req: Request, res: Response) => {
    try {
      const result = await mapCircleWebhookToDeposit(req.body);

      if (result.type === "skipped") {
        logger.info({ reason: result.reason }, "Circle webhook skipped");
        return sendApiResponse(res, {
          httpStatusCode: StatusCodes.OK,
          success: true,
          message: "Webhook ignored",
          data: { status: "ignored", reason: result.reason },
        });
      }

      if (result.type === "sweep_update") {
        return sendApiResponse(res, {
          httpStatusCode: StatusCodes.OK,
          success: true,
          message: "Sweep status updated",
          data: { status: "sweep_updated" },
        });
      }

      const { userId, walletId, network, txHash, amount } = result.data;

      logger.info({ userId, network, txHash, amount }, "Calling creditDeposit");

      const depositResult = await creditDeposit({
        userId,
        walletId,
        network,
        txHash,
        amount,
      });

      // logger deposit information
      logger.info(
        {
          userId,
          walletId,
          network,
          txHash,
          amount,
        },
        "Deposit credited successfully",
      );

      return sendApiResponse(res, {
        httpStatusCode: StatusCodes.OK,
        success: true,
        message: "Deposit processed successfully",
        data: depositResult,
      });
    } catch (error) {
      if (error instanceof DuplicateDepositError) {
        logger.warn({ err: error }, "Duplicate deposit webhook");
        return sendApiResponse(res, {
          httpStatusCode: StatusCodes.OK,
          success: true,
          message: "Deposit already processed",
          data: { status: "already_processed" },
        });
      }

      // Genuine failure — still ack Circle with 200 (see comment above), but
      // report success: false in the body so our own logs/monitoring can
      // tell this apart from an actually-successful webhook.
      logger.error(
        {
          err: error,
          eventId: req.body?.notification?.id,
          notificationType: req.body?.notification?.notificationType,
        },
        "Webhook processing failed",
      );

      return sendApiResponse(res, {
        httpStatusCode: StatusCodes.OK,
        success: false,
        message: "Webhook processing failed, logged internally",
      });
    }
  },
);
