import crypto from "crypto";
import { Router, type Request } from "express";
import { z } from "zod";
import { requireAuth } from "../../auth/auth.middleware";
import { asyncHandler } from "../../../utils/asyncHandler";
import { prisma } from "../../../lib/prisma";
import { AppError } from "../../../errors/AppError";
import { ErrorCodes } from "../../../errors/error-codes";
import { proxyRequest } from "./proxy.service";

export const playgroundSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/).max(100),
  apiKey: z.string().trim().min(1).max(200),
  path: z.string().max(2000).default("/"),
  query: z.record(z.string(), z.string()).default({}),
  body: z.unknown().optional(),
});

export const playgroundRouter = Router();
playgroundRouter.post("/playground", requireAuth, asyncHandler(async (req, res) => {
  const input = playgroundSchema.parse(req.body);
  const keyHash = crypto.createHash("sha256").update(input.apiKey).digest("hex");
  const key = await prisma.marketplaceConsumerKey.findUnique({ where: { keyHash }, select: { userId: true } });
  if (!key || key.userId !== req.user!.id) throw new AppError(403, "Use a marketplace API key from your own subscription", ErrorCodes.AUTH_FORBIDDEN);
  // Only forward the headers needed for the upstream request. Session cookies
  // and the Privy bearer must never reach the provider.
  const proxyReq = {
    headers: { authorization: `Bearer ${input.apiKey}`, "content-type": "application/json" },
    params: { slug: input.slug, path: input.path.split("/").filter(Boolean) },
    query: input.query, body: input.body,
  } as unknown as Request;
  await proxyRequest(proxyReq, res, input.slug);
}));
