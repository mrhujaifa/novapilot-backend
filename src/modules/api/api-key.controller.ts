import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { AppError } from "../../errors/AppError";
import { ErrorCodes } from "../../errors/error-codes";
import { NetworkEnv } from "../../generated/prisma";
import { createApiKeySchema } from "./api-key.schema";
import { createApiKey, listApiKeys, revokeApiKey } from "./api-key.service";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendApiResponse } from "../../utils/sendApiResponse";

export const createApiKeyHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user!.id;

    const parsed = createApiKeySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        parsed.error.issues[0].message,
        ErrorCodes.VALIDATION_ERROR,
      );
    }

    const result = await createApiKey({
      userId,
      name: parsed.data.name,
      network: parsed.data.network,
      spendingLimitUsdc: parsed.data.spendingLimitUsdc,
      expiresAt: parsed.data.expiresAt,
    });

    sendApiResponse(res, {
      httpStatusCode: StatusCodes.CREATED,
      success: true,
      message: "API key created successfully",
      data: result,
    });
  },
);

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
        ErrorCodes.INVALID_NETWORK,
      );
    }

    const apiKeys = await listApiKeys(userId, network as NetworkEnv);

    sendApiResponse(res, {
      httpStatusCode: StatusCodes.OK,
      success: true,
      message: "API keys fetched successfully",
      data: apiKeys,
    });
  },
);

export const revokeApiKeyHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const apiKeyId = req.params.id as string;

    await revokeApiKey(apiKeyId, userId);

    sendApiResponse(res, {
      httpStatusCode: StatusCodes.OK,
      success: true,
      message: "API key revoked",
      data: null,
    });
  },
);
