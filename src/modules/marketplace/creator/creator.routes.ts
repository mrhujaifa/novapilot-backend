import { Router } from "express";
import { requireAuth } from "../../auth/auth.middleware";
import { validateRequest } from "../../../middlewares/validateRequest";
import {
  createCreatorProfileSchema,
  updateCreatorProfileSchema,
} from "./creator.schema";
import { creatorController } from "./creator.controller";

const router = Router();

router.post(
  "/profile",
  requireAuth,
  validateRequest(createCreatorProfileSchema),
  creatorController.registerCreatorProfile,
);

router.get("/profile", requireAuth, creatorController.getCreatorProfile);

router.patch(
  "/profile",
  requireAuth,
  validateRequest(updateCreatorProfileSchema),
  creatorController.updateCreatorProfile,
);

export const creatorRouter = router;
