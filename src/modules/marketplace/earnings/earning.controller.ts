import { StatusCodes } from "http-status-codes";
import { asyncHandler } from "../../../utils/asyncHandler";
import { sendApiResponse } from "../../../utils/sendApiResponse";
import { earningService } from "./earning.service";

const getEarnings = asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const result = await earningService.getEarnings(userId);

  sendApiResponse(res, {
    httpStatusCode: StatusCodes.OK,
    success: true,
    message: "Earnings fetched successfully",
    data: result,
  });
});

export const earningController = { getEarnings };
