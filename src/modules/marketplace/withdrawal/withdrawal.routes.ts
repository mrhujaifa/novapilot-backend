import { Router } from "express";
import { requireAuth } from "../../auth/auth.middleware";
import { requireCreator } from "../../../middlewares/requireCreator";
import { validateRequest } from "../../../middlewares/validateRequest";
import { withdrawalSchema } from "./withdrawal.schema";
import { withdrawalController } from "./withdrawal.controller";

const router = Router();

router.post(
  "/withdrawal",
  requireAuth,
  requireCreator,
  validateRequest(withdrawalSchema),
  withdrawalController.createWithdrawal,
);

export const withdrawalRouter = router;
