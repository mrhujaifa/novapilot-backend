import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { StatusCodes } from "http-status-codes";
import { logger } from "../lib/logger";
import { AppError } from "../utils/AppError";
import { errorResponse } from "../utils/apiResponse";

// Must be registered last, after all routes, with 4 params so Express treats it as an error handler
export function globalErrorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    errorResponse(res, StatusCodes.BAD_REQUEST, err.issues.map((i) => i.message).join(", "));
    return;
  }

  if (err instanceof AppError) {
    if (!err.isOperational) {
      logger.error({ err }, "Non-operational AppError");
    }
    errorResponse(res, err.status, err.message);
    return;
  }

  // Unexpected error — log full details, but never leak internals to the client
  logger.error({ err, path: req.path }, "Unhandled error");
  errorResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, "Something went wrong");
}
