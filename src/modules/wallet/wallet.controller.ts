import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { transactionQuerySchema } from "./wallet.dto";
import { getBalanceSummary, getTransactionHistory } from "./wallet.service";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendApiResponse } from "../../utils/sendApiResponse";
import { parseNetworkQuery } from "../../utils/parse-network-query";

export const getBalance = asyncHandler(async (req: Request, res: Response) => {
  const network = parseNetworkQuery(req.query.network);
  const summary = await getBalanceSummary(req.user!.id, network);

  sendApiResponse(res, {
    httpStatusCode: StatusCodes.OK,
    success: true,
    message: "Balance fetched successfully",
    data: summary,
  });
});

export const listTransactions = asyncHandler(
  async (req: Request, res: Response) => {
    const query = transactionQuerySchema.parse(req.query);
    const result = await getTransactionHistory(req.user!.id, query);

    sendApiResponse(res, {
      httpStatusCode: StatusCodes.OK,
      success: true,
      message: "Transactions fetched successfully",
      data: result,
    });
  },
);
