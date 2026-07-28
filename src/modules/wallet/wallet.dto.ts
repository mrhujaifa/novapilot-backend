import { z } from "zod";

// Query params for GET /api/wallet/transactions
export const transactionQuerySchema = z.object({
  network: z.enum(["TESTNET", "MAINNET"]),
  filter: z.enum(["all", "deposit", "debit"]).default("all"),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type TransactionQuery = z.infer<typeof transactionQuerySchema>;
