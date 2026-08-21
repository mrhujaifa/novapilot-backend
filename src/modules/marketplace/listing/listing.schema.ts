import { z } from "zod";
import { ApiPricingModel } from "../../../generated/prisma";

export const createApiListingSchema = z.object({
  apiName: z.string().min(3).max(100),

  // URL-safe identifier; immutable after creation.
  apiSlug: z
    .string()
    .max(100)
    .toLowerCase()
    .regex(
      /^[a-z0-9-]+$/,
      "Slug only allows lowercase letters, numbers, and hyphens",
    ),

  description: z.string().min(20).max(1000),
  category: z.string().min(2).max(50),

  // Only HTTPS targets are allowed for secure proxying.
  targetOriginUrl: z
    .string()
    .url()
    .refine((url) => url.startsWith("https://"), {
      message: "Target URL must use HTTPS",
    }),

  pricingModel: z.nativeEnum(ApiPricingModel),
  costPer1kCalls: z.number().positive().max(1000),

  // Credentials used by the proxy when forwarding requests.
  headerName: z.string().min(1).max(100),
  headerValue: z.string().min(1).max(500),
});

export const updateApiListingSchema = z.object({
  apiName: z.string().min(3).max(100).optional(),
  description: z.string().min(20).max(1000).optional(),
  category: z.string().min(2).max(50).optional(),
  // Slug and target URL remain immutable to prevent breaking consumers.
});

export type CreateApiListingInput = z.infer<typeof createApiListingSchema>;
export type UpdateApiListingInput = z.infer<typeof updateApiListingSchema>;
