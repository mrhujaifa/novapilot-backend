import { z } from "zod";

export const withdrawalSchema = z.object({
  amountUsdc: z.number().positive().min(1),
  destinationAddress: z.string().min(10),
});

export type WithdrawalInput = z.infer<typeof withdrawalSchema>;
