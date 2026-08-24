import { Router } from "express";
import { consumerController } from "./consumer.controller";
import { requireAuth } from "../../auth/auth.middleware";
import { validateRequest } from "../../../middlewares/validateRequest";
import { updateSubscriptionSchema } from "./consumer.schema";

const router = Router();

router.get("/", consumerController.browseMarketplace);
router.get("/:slug", consumerController.getApiBySlug);

router.post(
  "/:slug/subscriptions",
  requireAuth,
  consumerController.subscribeToApi,
);

router.patch(
  "/:slug/subscriptions",
  requireAuth,
  validateRequest(updateSubscriptionSchema),
  consumerController.updateSubscription,
);

router.delete(
  "/:slug/subscriptions",
  requireAuth,
  consumerController.unsubscribeFromApi,
);

export const consumerRouter = router;
