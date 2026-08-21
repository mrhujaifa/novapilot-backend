import z from "zod";

export const browseMarketplaceSchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  sort: z.enum(["calls", "price", "latency"]).optional(),
  page: z.coerce.number().default(1),
  limit: z.coerce.number().max(50).default(10),
});

export type BrowseMarketplaceQuery = z.infer<typeof browseMarketplaceSchema>;
