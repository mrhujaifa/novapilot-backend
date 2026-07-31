import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware";
import {
  createApiKeyHandler,
  listApiKeysHandler,
  revokeApiKeyHandler,
} from "./api-key.controller";

const router = Router();

router.post("/api/api-keys", requireAuth, createApiKeyHandler);
router.get("/api/api-keys", requireAuth, listApiKeysHandler);
router.delete("/api/api-keys/:id", requireAuth, revokeApiKeyHandler);

export const ApiKeyRoutes = router;
