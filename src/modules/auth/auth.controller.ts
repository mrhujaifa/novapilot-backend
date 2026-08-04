import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { sendApiResponse } from "../../utils/sendApiResponse";
import { asyncHandler } from "../../utils/asyncHandler";
import { AppError } from "../../errors/AppError";
import { ErrorCodes } from "../../errors/error-codes";

// Controller only formats and sends the response — no business logic here.
export const getMe = asyncHandler((req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(
      StatusCodes.UNAUTHORIZED,
      "Authentication required",
      ErrorCodes.AUTH_UNAUTHORIZED,
    );
  }

  sendApiResponse(res, {
    httpStatusCode: StatusCodes.OK,
    success: true,
    message: "User profile retrieved successfully",
    data: req.user,
  });
});
