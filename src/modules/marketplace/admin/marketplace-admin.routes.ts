import { Router } from "express";
import { requireAuth } from "../../auth/auth.middleware";
import { marketplaceAdminController } from "./marketplace-admin.controller";

const router = Router();

// Admin only — later requireAdmin middleware add করবে
router.get(
  "/apis/pending",
  requireAuth,
  marketplaceAdminController.getPendingApis,
);

router.patch(
  "/apis/:id/status",
  requireAuth,
  marketplaceAdminController.updateApiStatus,
);

router.patch(
  "/creators/:creatorId/verify",
  requireAuth,
  marketplaceAdminController.verifyCreator,
);

export const marketplaceAdminRouter = router;
