import { z } from "zod";
import { ApiPricingModel } from "../../../generated/prisma";

const authSpecSchema = z
  .object({
    type: z.enum([
      "none",
      "api_key_header",
      "api_key_query",
      "api_key_path",
      "bearer",
      "basic",
      "custom_header",
    ]),
    name: z.string().optional(),
    credentialRef: z.string().optional(),
  })
  .nullable()
  .optional();

const requestSpecSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  pathTemplate: z.string().min(1),
  headers: z.string().optional(),
});

export const createApiListingSchema = z.object({
  apiName: z.string().min(3).max(100),
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
  targetBaseUrl: z
    .string()
    .url()
    .refine((url) => url.startsWith("https://"), {
      message: "Target URL must use HTTPS",
    }),
  requestSpec: requestSpecSchema,
  authSpec: authSpecSchema,
  credentialValue: z.string().optional(),
  credentialUsername: z.string().optional(),
  credentialPassword: z.string().optional(),
  pricingModel: z.nativeEnum(ApiPricingModel),
  costPer1kCalls: z.number().positive().max(1000),
});

export const updateApiListingSchema = z.object({
  apiName: z.string().min(3).max(100).optional(),
  description: z.string().min(20).max(1000).optional(),
  category: z.string().min(2).max(50).optional(),
});

export type CreateApiListingInput = z.infer<typeof createApiListingSchema>;
export type UpdateApiListingInput = z.infer<typeof updateApiListingSchema>;
