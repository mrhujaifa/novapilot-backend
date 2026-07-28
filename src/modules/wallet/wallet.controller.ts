import type { Request, Response } from "express";
import { transactionQuerySchema } from "./wallet.dto";
import { getBalanceSummary, getTransactionHistory } from "./wallet.service";
import { asyncHandler } from "../../utils/asyncHandler";

export const getBalance = asyncHandler(async (req: Request, res: Response) => {
  const network = (req.query.network as "TESTNET" | "MAINNET") ?? "TESTNET";
  const summary = await getBalanceSummary(req.user!.id, network);
  res.json(summary);
});

export const listTransactions = asyncHandler(async (req: Request, res: Response) => {
  const query = transactionQuerySchema.parse(req.query);
  const result = await getTransactionHistory(req.user!.id, query);
  res.json(result);
});
