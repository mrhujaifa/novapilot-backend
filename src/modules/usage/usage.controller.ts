import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { asyncHandler } from "../../utils/asyncHandler";
import { NetworkEnv } from "../../generated/prisma";
import { getUsageHistory, getUsageSummary } from "../billing/billing.service";
import { AppError } from "../../errors/AppError";
import { sendApiResponse } from "../../utils/sendApiResponse";
import { ErrorCodes } from "../../errors/error-codes";

// Shared by both handlers below — network is a required, enum-validated
// query param on every usage endpoint. Kept as a plain function (not a
// Zod schema) since it's a single field; promote to a schema if more
// query params need validation here later.
function parseNetworkQuery(network: unknown): NetworkEnv {
  if (
    typeof network !== "string" ||
    !Object.values(NetworkEnv).includes(network as NetworkEnv)
  ) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Valid network query parameter is required",
      ErrorCodes.INVALID_NETWORK,
    );
  }
  return network as NetworkEnv;
}

export const getUsageLogs = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const network = parseNetworkQuery(req.query.network);

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

    const result = await getUsageHistory({ userId, network, page, limit });

    sendApiResponse(res, {
      httpStatusCode: StatusCodes.OK,
      success: true,
      message: "Usage history fetched successfully",
      data: result.items,
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  },
);

export const getUsageSummaryHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const network = parseNetworkQuery(req.query.network);

    const result = await getUsageSummary({ userId, network });

    sendApiResponse(res, {
      httpStatusCode: StatusCodes.OK,
      success: true,
      message: "Usage summary fetched successfully",
      data: result,
    });
  },
);
