import { Router } from "express";
import { consumerController } from "./consumer.controller";
import { requireAuth } from "../../auth/auth.middleware";

const router = Router();

router.get("/", consumerController.browseMarketplace);
router.get("/:slug", consumerController.getApiBySlug);

router.post(
  "/:slug/subscriptions",
  requireAuth,
  consumerController.subscribeToApi,
);

export const consumerRouter = router;
