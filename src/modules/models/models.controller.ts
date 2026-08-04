import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { getActiveModels } from "./models.service";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendApiResponse } from "../../utils/sendApiResponse";

// Public endpoint — no auth required, the model catalog is not user-specific.
export const handleGetModels = asyncHandler(
  async (_req: Request, res: Response) => {
    const models = await getActiveModels();

    sendApiResponse(res, {
      httpStatusCode: StatusCodes.OK,
      success: true,
      message: "Models fetched successfully",
      data: { models },
    });
  },
);
