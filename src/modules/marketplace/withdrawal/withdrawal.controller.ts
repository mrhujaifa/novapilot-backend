import { StatusCodes } from "http-status-codes";
import { asyncHandler } from "../../../utils/asyncHandler";
import { sendApiResponse } from "../../../utils/sendApiResponse";
import { withdrawalService } from "./withdrawal.service";

const createWithdrawal = asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const result = await withdrawalService.createWithdrawal(userId, req.body);

  sendApiResponse(res, {
    httpStatusCode: StatusCodes.CREATED,
    success: true,
    message: "Withdrawal request submitted successfully",
    data: result,
  });
});

export const withdrawalController = { createWithdrawal };
