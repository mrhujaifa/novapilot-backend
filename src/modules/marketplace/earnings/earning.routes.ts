import { Router } from "express";
import { requireAuth } from "../../auth/auth.middleware";
import { requireCreator } from "../../../middlewares/requireCreator";
import { earningController } from "./earning.controller";

const router = Router();

router.get(
  "/earnings",
  requireAuth,
  requireCreator,
  earningController.getEarnings,
);

export const earningRouter = router;
