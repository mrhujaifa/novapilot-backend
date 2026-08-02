import { Router } from "express";

import { handleGetModels } from "./models.controller";

const router = Router();

/**
 * Public model catalog.
 * Authentication is not required.
 */
router.get("/", handleGetModels);

export const modelsRouter = router;
