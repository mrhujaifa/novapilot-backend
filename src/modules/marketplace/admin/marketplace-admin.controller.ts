import { StatusCodes } from "http-status-codes";
import { asyncHandler } from "../../../utils/asyncHandler";
import { sendApiResponse } from "../../../utils/sendApiResponse";
import { marketplaceAdminService } from "./marketplace-admin.service";

const getPendingApis = asyncHandler(async (_req, res) => {
  const result = await marketplaceAdminService.getPendingApis();

  sendApiResponse(res, {
    httpStatusCode: StatusCodes.OK,
    success: true,
    message: "Pending APIs fetched",
    data: result,
  });
});

const updateApiStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const result = await marketplaceAdminService.updateApiStatus(
    id as string,
    status,
  );

  sendApiResponse(res, {
    httpStatusCode: StatusCodes.OK,
    success: true,
    message: "API status updated",
    data: result,
  });
});

const verifyCreator = asyncHandler(async (req, res) => {
  const { creatorId } = req.params;

  const result = await marketplaceAdminService.verifyCreator(
    creatorId as string,
  );

  sendApiResponse(res, {
    httpStatusCode: StatusCodes.OK,
    success: true,
    message: "Creator verified successfully",
    data: result,
  });
});

export const marketplaceAdminController = {
  getPendingApis,
  updateApiStatus,
  verifyCreator,
};
