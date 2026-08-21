import { Router } from "express";
import { consumerController } from "./consumer.controller";

const router = Router();

router.get("/", consumerController.browseMarketplace);
router.get("/:slug", consumerController.getApiBySlug);

export const consumerRouter = router;
