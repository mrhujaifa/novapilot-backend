import { z } from "zod";

const networkSchema = z.enum(["TESTNET", "MAINNET"]);

export const createConversationSchema = z.object({
  network: networkSchema,
  title: z.string().min(1).max(255).optional(),
});

export type CreateConversationBody = z.infer<typeof createConversationSchema>;

export const sendMessageSchema = z.object({
  network: networkSchema,
  modelPricingId: z.string().uuid(),
  content: z.string().min(1).max(10000),
});

export type SendMessageBody = z.infer<typeof sendMessageSchema>;

export const renameConversationSchema = z.object({
  title: z.string().min(1).max(255),
});

export type RenameConversationBody = z.infer<typeof renameConversationSchema>;

export const listConversationsQuerySchema = z.object({
  network: networkSchema,
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListConversationsQuery = z.infer<typeof listConversationsQuerySchema>;

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
