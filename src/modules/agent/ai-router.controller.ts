import { Request, Response } from "express";
import { handleChatStream, assertHasBalance } from "./ai-router.service";
import { asyncHandler } from "../../utils/asyncHandler";
import { chatRequestSchema } from "./ai-router.schema";

export const handleChat = asyncHandler(async (req: Request, res: Response) => {
  const body = chatRequestSchema.parse(req.body);
  const userId = req.user!.id;

  // Fail fast before spending any provider tokens if balance is already empty
  await assertHasBalance(userId, body.network);

  const result = await handleChatStream({
    userId,
    network: body.network,
    modelPricingId: body.modelPricingId,
    prompt: body.prompt,
  });

  // Pipes the Vercel AI SDK stream directly to the client as it generates
  result.pipeTextStreamToResponse(res);
});
