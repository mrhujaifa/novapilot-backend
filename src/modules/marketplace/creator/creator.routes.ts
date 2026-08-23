import { Router } from "express";
import { requireAuth } from "../../auth/auth.middleware";
import { validateRequest } from "../../../middlewares/validateRequest";
import {
  createCreatorProfileSchema,
  updateCreatorProfileSchema,
} from "./creator.schema";
import { creatorController } from "./creator.controller";
import { requireCreator } from "../../../middlewares/requireCreator";

const router = Router();

router.post(
  "/profile",
  requireAuth,
  validateRequest(createCreatorProfileSchema),
  creatorController.registerCreatorProfile,
);

router.get(
  "/profile",
  requireAuth,
  requireCreator,
  creatorController.getCreatorProfile,
);

router.patch(
  "/profile",
  requireAuth,
  requireCreator,
  validateRequest(updateCreatorProfileSchema),
  creatorController.updateCreatorProfile,
);

router.get(
  "/analytics",
  requireAuth,
  requireCreator,
  creatorController.getCreatorAnalytics,
);

export const creatorRouter = router;
