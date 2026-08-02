import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import { AppError } from "../utils/AppError";
import { errorResponse } from "../utils/apiResponse";
import { logger } from "../lib/logger";

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
) {
  // Operational errors (expected — bad input, auth failure, insufficient
  // balance) — safe to expose err.message directly to the client.
  if (err instanceof AppError) {
    logger.warn(
      {
        status: err.status,
        message: err.message,
        path: req.path,
        method: req.method,
      },
      "Operational error",
    );
    return errorResponse(res, err.status, err.message);
  }

  // Unknown errors (bugs, unhandled edge cases) — log full detail
  // server-side, but never leak internals (stack trace, DB error text)
  // to the client. Attackers can use raw error messages to fingerprint
  // the stack or find injection points.
  logger.error(
    { err, path: req.path, method: req.method, body: req.body },
    "Unhandled error",
  );
  return errorResponse(
    res,
    StatusCodes.INTERNAL_SERVER_ERROR,
    "Internal server error",
  );
}
