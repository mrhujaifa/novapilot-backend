import { StatusCodes } from "http-status-codes";
import { asyncHandler } from "../../../utils/asyncHandler";
import { sendApiResponse } from "../../../utils/sendApiResponse";
import { listingService } from "./listing.service";

const createApiListing = asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const payload = req.body;
  const result = await listingService.createApiListing(userId, payload);

  sendApiResponse(res, {
    httpStatusCode: StatusCodes.CREATED,
    success: true,
    message: "Api listing successfull!",
    data: result,
  });
});

const getApiListing = asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const result = await listingService.getApiListing(userId);

  sendApiResponse(res, {
    httpStatusCode: StatusCodes.OK,
    success: true,
    message: "Get all api listing successfull",
    data: result,
  });
});

const getApiListingById = asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const result = await listingService.getApiListingById(userId, id as string);

  sendApiResponse(res, {
    httpStatusCode: StatusCodes.OK,
    success: true,
    message: "API fetched successfully",
    data: result,
  });
});

export const listingController = {
  createApiListing,
  getApiListing,
  getApiListingById,
};
