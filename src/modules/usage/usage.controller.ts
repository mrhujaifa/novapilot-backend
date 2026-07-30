import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { NetworkEnv } from "../../generated/prisma";
import { getUsageHistory, getUsageSummary } from "../billing/billing.service";
import { AppError } from "../../utils/AppError";

export const getUsageLogs = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user!.id;

    const network = req.query.network as string;
    if (
      !network ||
      !Object.values(NetworkEnv).includes(network as NetworkEnv)
    ) {
      throw new AppError(400, "Valid network query param is required");
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

    const result = await getUsageHistory({
      userId,
      network: network as NetworkEnv,
      page,
      limit,
    });

    res.status(200).json({
      success: true,
      data: result.items,
      pagination: {
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

    const network = req.query.network as string;
    if (
      !network ||
      !Object.values(NetworkEnv).includes(network as NetworkEnv)
    ) {
      throw new AppError(400, "Valid network query param is required");
    }

    const result = await getUsageSummary({
      userId,
      network: network as NetworkEnv,
    });

    res.status(200).json({ success: true, data: result });
  },
);
