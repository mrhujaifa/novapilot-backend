import { z } from "zod";

export const publicChatSchema = z.object({
  model: z.string().min(1), // model slug, e.g. "claude-3-5-sonnet" — resolved to a ModelPricing internally
  message: z.string().min(1).max(20_000),
});

export type PublicChatBody = z.infer<typeof publicChatSchema>;
