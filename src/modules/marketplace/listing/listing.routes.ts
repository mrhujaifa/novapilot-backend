import { Router } from "express";
import { requireAuth } from "../../auth/auth.middleware";
import { validateRequest } from "../../../middlewares/validateRequest";
import { createApiListingSchema } from "../listing/listing.schema";
import { listingController } from "./listing.controller";
const router = Router();

router.post(
  "/apis",
  requireAuth,
  validateRequest(createApiListingSchema),
  listingController.createApiListing,
);
router.get("/apis", requireAuth, listingController.getApiListing);

export const listingRouter = router;
