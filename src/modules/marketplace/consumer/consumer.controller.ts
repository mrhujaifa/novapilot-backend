import { StatusCodes } from "http-status-codes";
import { asyncHandler } from "../../../utils/asyncHandler";
import { sendApiResponse } from "../../../utils/sendApiResponse";
import { consumerService } from "./consumer.service";
import { browseMarketplaceSchema } from "./consumer.schema";

const browseMarketplace = asyncHandler(async (req, res) => {
  const query = browseMarketplaceSchema.parse(req.query);

  const result = await consumerService.browseMarketplace(query);

  sendApiResponse(res, {
    httpStatusCode: StatusCodes.OK,
    success: true,
    message: "Marketplace APIs fetched successfully",
    data: result.data,
    meta: {
      total: result.pagination.total,
      page: result.pagination.page,
      limit: result.pagination.limit,
      totalPages: result.pagination.totalPages,
    },
  });
});
const getApiBySlug = asyncHandler(async (req, res) => {
  const { slug } = req.params;

  const result = await consumerService.getApiBySlug(slug as string);

  sendApiResponse(res, {
    httpStatusCode: StatusCodes.OK,
    success: true,
    message: "API fetched successfully",
    data: result,
  });
});

export const consumerController = {
  browseMarketplace,
  getApiBySlug,
};
