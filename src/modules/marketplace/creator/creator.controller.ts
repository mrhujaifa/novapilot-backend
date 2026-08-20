import { StatusCodes } from "http-status-codes";
import { AppError } from "../../../errors/AppError";
import { asyncHandler } from "../../../utils/asyncHandler";
import { creatorService } from "./creator.service";
import { ErrorCodes } from "../../../errors/error-codes";
import { sendApiResponse } from "../../../utils/sendApiResponse";

const registerCreatorProfile = asyncHandler(async (req, res) => {
  const userId = req.user!.id;

  if (!userId) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "User not found!",
      ErrorCodes.USER_NOT_FOUND,
    );
  }
  const payload = req.body;

  const result = await creatorService.registerCreatorProfile(userId, payload);

  sendApiResponse(res, {
    httpStatusCode: StatusCodes.CREATED,
    success: true,
    message: "Creator registered successfully",
    data: result,
  });
});

// Get creator profile
const getCreatorProfile = asyncHandler(async (req, res) => {
  const userId = req.user!.id;

  if (!userId) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "User not found",
      ErrorCodes.USER_NOT_FOUND,
    );
  }

  const result = await creatorService.getCreatorProfile(userId);

  sendApiResponse(res, {
    httpStatusCode: StatusCodes.OK,
    success: true,
    message: "Creator Profile get successfull",
    data: result,
  });
});

// update creator profile
const updateCreatorProfile = asyncHandler(async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "User not found",
      ErrorCodes.USER_NOT_FOUND,
    );
  }
  const payload = req.body;

  const result = await creatorService.updateCreatorProfile(userId, payload);

  sendApiResponse(res, {
    httpStatusCode: StatusCodes.OK,
    success: true,
    message: "Profile updated successfully!",
    data: result,
  });
});

export const creatorController = {
  registerCreatorProfile,
  getCreatorProfile,
  updateCreatorProfile,
};
