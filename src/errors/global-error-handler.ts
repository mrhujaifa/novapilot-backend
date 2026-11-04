import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import { ZodError } from "zod";

import { logger } from "../lib/logger";
import { ErrorCodes } from "./error-codes";
import { sendApiResponse } from "../utils/sendApiResponse";
import { AppError } from "./AppError";

export function globalErrorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  if (res.headersSent) {
    logger.error({ err, path: req.originalUrl, method: req.method }, "Request failed after response headers were sent");
    _next(err);
    return;
  }
  // Zod validation error — always safe to expose field-level details.
  if (err instanceof ZodError) {
    sendApiResponse(res, {
      httpStatusCode: StatusCodes.BAD_REQUEST,
      success: false,
      message: "Validation failed",
      code: ErrorCodes.VALIDATION_ERROR,
      details: err.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  // Known, expected application error (bad input, auth failure, insufficient
  // balance, etc). expose controls whether the raw message reaches the
  // client — false for anything we don't want leaking internals.
  if (err instanceof AppError) {
    logger.warn(
      {
        status: err.status,
        code: err.code,
        path: req.originalUrl,
        method: req.method,
      },
      "Operational error",
    );

    sendApiResponse(res, {
      httpStatusCode: err.status,
      success: false,
      message: err.expose ? err.message : "Internal server error",
      code: err.code,
      details: err.expose ? err.details : undefined,
    });
    return;
  }

  // Anything else is an unexpected bug — log full detail server-side
  // (including stack, via pino's error serializer), never leak internals
  // to the client.
  logger.error(
    // Request bodies can contain upstream API credentials and passwords.
    { err, path: req.originalUrl, method: req.method },
    "Unhandled application error",
  );

  sendApiResponse(res, {
    httpStatusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    success: false,
    message: "Internal server error",
    code: ErrorCodes.INTERNAL_SERVER_ERROR,
  });
}
