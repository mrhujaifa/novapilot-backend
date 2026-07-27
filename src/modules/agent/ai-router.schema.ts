import { z } from "zod";

export const chatRequestSchema = z.object({
  network: z.enum(["TESTNET", "MAINNET"]),
  modelPricingId: z.string().uuid(),
  prompt: z.string().min(1).max(10000),
});

export type ChatRequestBody = z.infer<typeof chatRequestSchema>;
