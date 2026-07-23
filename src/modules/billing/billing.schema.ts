import { z } from "zod";

export const deductUsageSchema = z.object({
  network: z.enum(["TESTNET", "MAINNET"]),
  modelPricingId: z.string().uuid(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  idempotencyKey: z.string().uuid(), // caller (AI Provider Router) generates one per request
});

export const getBalanceQuerySchema = z.object({
  network: z.enum(["TESTNET", "MAINNET"]),
});

export const creditDepositSchema = z.object({
  userId: z.string().uuid(),
  walletId: z.string().uuid(),
  network: z.enum(["TESTNET", "MAINNET"]),
  txHash: z.string().min(1),
  amount: z.string(), // sent as string to avoid float precision loss
});

export const usageHistoryQuerySchema = z.object({
  network: z.enum(["TESTNET", "MAINNET"]),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type DeductUsageBody = z.infer<typeof deductUsageSchema>;
export type CreditDepositBody = z.infer<typeof creditDepositSchema>;
export type UsageHistoryQuery = z.infer<typeof usageHistoryQuerySchema>;
