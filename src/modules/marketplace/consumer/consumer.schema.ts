import z from "zod";

export const browseMarketplaceSchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  sort: z.enum(["calls", "price", "latency"]).optional(),
  page: z.coerce.number().default(1),
  limit: z.coerce.number().max(50).default(10),
});

export const updateSubscriptionSchema = z.object({
  action: z.enum(["PAUSE", "RESUME"]),
});

export const marketplaceUsageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  apiSlug: z.string().trim().min(1).optional(),
});

export const createApiReportSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "Report reason must be at least 10 characters")
    .max(2000, "Report reason must not exceed 2000 characters"),

  evidence: z
    .string()
    .trim()
    .max(5000, "Evidence must not exceed 5000 characters")
    .optional(),
});

export type BrowseMarketplaceQuery = z.infer<typeof browseMarketplaceSchema>;
export type UpdateSubscriptionPayload = z.infer<
  typeof updateSubscriptionSchema
>;
export type MarketplaceUsageQuery = z.infer<typeof marketplaceUsageQuerySchema>;
export type CreateApiReportPayload = z.infer<typeof createApiReportSchema>;
