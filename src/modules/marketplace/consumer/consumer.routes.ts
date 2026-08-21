import { Router } from "express";
import { requireAuth } from "../../auth/auth.middleware";
import { validateRequest } from "../../../middlewares/validateRequest";
import { browseMarketplaceSchema } from "./consumer.schema";
import { consumerController } from "./consumer.controller";

const router = Router();

router.get("/", consumerController.browseMarketplace);

export const consumerRouter = router;
