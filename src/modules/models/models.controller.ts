import { Request, Response } from "express";
import { getActiveModels } from "./models.service";
import { asyncHandler } from "../../utils/asyncHandler";
import { successResponse } from "../../utils/apiResponse";

export const handleGetModels = asyncHandler(async (_req: Request, res: Response) => {
  const models = await getActiveModels();
  return successResponse(res, { models });
});
