import { z } from "zod";

export const createCreatorProfileSchema = z.object({
  displayName: z.string().max(50).optional(),
  bio: z.string().max(500).optional(),
  website: z.string().url().optional(),
  avatarUrl: z.string().url().optional(),
  companyName: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  githubUrl: z.string().url().optional(),
  twitterUrl: z.string().url().optional(),
});

export const updateCreatorProfileSchema = createCreatorProfileSchema;

export type CreateCreatorProfileInput = z.infer<
  typeof createCreatorProfileSchema
>;

export type UpdateCreatorProfileInput = z.infer<
  typeof updateCreatorProfileSchema
>;
