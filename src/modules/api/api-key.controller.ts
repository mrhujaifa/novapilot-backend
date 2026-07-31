import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { AppError } from "../../utils/AppError";
import { NetworkEnv } from "../../generated/prisma";
import { createApiKeySchema } from "./api-key.schema";
import { createApiKey, listApiKeys, revokeApiKey } from "./api-key.service";
import { asyncHandler } from "../../utils/asyncHandler";

/**
 * POST /api/api-keys
 * Creates a new API key for the authenticated user. The raw key is
 * returned exactly once in this response — the client must show it to
 * the user immediately and store nothing except what's rendered here.
 */
export const createApiKeyHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user!.id;

    const parsed = createApiKeySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        parsed.error.issues[0].message,
      );
    }

    const result = await createApiKey({
      userId,
      name: parsed.data.name,
      network: parsed.data.network,
      spendingLimitUsdc: parsed.data.spendingLimitUsdc,
      expiresAt: parsed.data.expiresAt,
    });

    res.status(StatusCodes.CREATED).json({
      success: true,
      data: result,
    });
  },
);

/**
 * GET /api/api-keys?network=TESTNET
 * Lists all API keys for the authenticated user on the given network.
 * Never includes the raw key or hash — display-safe metadata only.
 */
export const listApiKeysHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user!.id;

    const network = req.query.network as string;
    if (
      !network ||
      !Object.values(NetworkEnv).includes(network as NetworkEnv)
    ) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "Valid network query param is required",
      );
    }

    const apiKeys = await listApiKeys(userId, network as NetworkEnv);

    res.status(StatusCodes.OK).json({
      success: true,
      data: apiKeys,
    });
  },
);

/**
 * DELETE /api/api-keys/:id
 * Revokes an API key. Soft-delete — the key immediately stops working
 * but the record is preserved for usage-history/audit purposes.
 */
export const revokeApiKeyHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const apiKeyId = req.params.id as string;

    await revokeApiKey(apiKeyId, userId);

    res.status(StatusCodes.OK).json({
      success: true,
      message: "API key revoked",
    });
  },
);
