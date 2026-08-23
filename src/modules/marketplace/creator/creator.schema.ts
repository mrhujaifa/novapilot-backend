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

export const updateCreatorProfileSchema = z.object({
  displayName: z.string().max(50).optional(),
  bio: z.string().max(500).optional(),
  website: z.string().url().optional().or(z.literal("")),
  avatarUrl: z.string().url().optional().or(z.literal("")),
  companyName: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  githubUrl: z.string().url().optional().or(z.literal("")),
  twitterUrl: z.string().url().optional().or(z.literal("")),
});

export type CreateCreatorProfileInput = z.infer<
  typeof createCreatorProfileSchema
>;

export type UpdateCreatorProfileInput = z.infer<
  typeof updateCreatorProfileSchema
>;
