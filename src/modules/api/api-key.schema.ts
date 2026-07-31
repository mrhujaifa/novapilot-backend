import { z } from "zod";
import { NetworkEnv } from "../../generated/prisma";

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  network: z.nativeEnum(NetworkEnv),
  spendingLimitUsdc: z.string().optional(),
  expiresAt: z.coerce.date().optional(),
});

export type CreateApiKeyBody = z.infer<typeof createApiKeySchema>;
