import { z } from "zod";

export const withdrawalSchema = z.object({
  amountUsdc: z.number().positive().min(1).refine((amount) => Number.isSafeInteger(Math.round(amount * 1e6)) && Math.abs(amount * 1e6 - Math.round(amount * 1e6)) < 0.000001, "Use at most 6 decimal places"),
  destinationAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Enter a valid EVM wallet address").refine((value) => !/^0x0{40}$/i.test(value), "The zero address is not allowed"),
});

export type WithdrawalInput = z.infer<typeof withdrawalSchema>;
