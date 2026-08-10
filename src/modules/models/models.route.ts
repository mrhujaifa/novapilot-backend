import { Router } from "express";

import { handleGetModels } from "./models.controller";
import { sendApiResponse } from "../../utils/sendApiResponse";
import { asyncHandler } from "../../utils/asyncHandler";
import { prisma } from "../../lib/prisma";
import { StatusCodes } from "http-status-codes";

const router = Router();

/**
 * Public model catalog.
 * Authentication is not required.
 */
router.get("/", handleGetModels);
router.get(
  "/active",
  asyncHandler(async (req, res) => {
    const models = await prisma.modelPricing.findMany({
      where: { effectiveTo: null, aiModel: { isActive: true } },
      include: { aiModel: { include: { aiProvider: true } } },
      orderBy: { aiModel: { modelName: "asc" } },
    });

    sendApiResponse(res, {
      httpStatusCode: StatusCodes.OK,
      success: true,
      message: "Active models fetched",
      data: models.map((m) => ({
        modelName: m.aiModel.modelName,
        providerName: m.aiModel.aiProvider.name,
        inputPricePerM: m.inputPricePerM.toString(),
        outputPricePerM: m.outputPricePerM.toString(),
      })),
    });
  }),
);

export const modelsRouter = router;
