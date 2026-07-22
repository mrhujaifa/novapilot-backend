import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import { AppError } from "../utils/AppError";
import { errorResponse } from "../utils/apiResponse";
import { logger } from "../lib/logger";

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return errorResponse(res, err.status, err.message);
  }

  logger.error({ err }, "Unhandled error");
  return errorResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, "Internal server error");
}
