import { Request, Response, NextFunction } from "express";
import { NetworkEnv } from "../../generated/prisma";

/**
 * Bridges session auth → apiKeyContext shape.
 * The openAiCompatHandler only reads req.apiKeyContext —
 * it doesn't care whether it came from an API key or a session.
 * This middleware fills that shape from the authenticated session user.
 */
export function injectSessionAsApiContext(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const user = req.user!;

  req.apiKeyContext = {
    apiKeyId: null as unknown as string, // session requests have no API key
    userId: user.id,
    network: (process.env.DEFAULT_NETWORK as NetworkEnv) ?? NetworkEnv.TESTNET,
    spendingLimitUsdc: null,
    spentUsdc: "0",
  };

  next();
}
