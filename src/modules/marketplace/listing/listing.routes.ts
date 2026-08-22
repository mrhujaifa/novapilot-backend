import { Router } from "express";
import { requireAuth } from "../../auth/auth.middleware";
import { validateRequest } from "../../../middlewares/validateRequest";
import { createApiListingSchema } from "../listing/listing.schema";
import { listingController } from "./listing.controller";
import { requireCreator } from "../../../middlewares/requireCreator";
const router = Router();

router.post(
  "/apis",
  requireAuth,
  requireCreator,
  validateRequest(createApiListingSchema),
  listingController.createApiListing,
);

router.get(
  "/apis",
  requireAuth,
  requireCreator,
  listingController.getApiListing,
);

export const listingRouter = router;
