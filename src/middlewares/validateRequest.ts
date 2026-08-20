import { NextFunction, Request, Response } from "express";
import { ZodTypeAny } from "zod";
import { StatusCodes } from "http-status-codes";
import { AppError } from "../errors/AppError";
import { ErrorCodes } from "../errors/error-codes";

// Validates req.body against a Zod schema before hitting the controller
export const validateRequest =
  (schema: ZodTypeAny) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      throw new AppError(
        StatusCodes.UNPROCESSABLE_ENTITY,
        result.error.issues[0].message,
        ErrorCodes.VALIDATION_ERROR,
      );
    }

    req.body = result.data;
    next();
  };
