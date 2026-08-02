import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware";
import {
  createApiKeyHandler,
  listApiKeysHandler,
  revokeApiKeyHandler,
} from "./api-key.controller";

const router = Router();

/**
 * API key management.
 * All routes require an authenticated user.
 */
router.use(requireAuth);

router.post("/", createApiKeyHandler);
router.get("/", listApiKeysHandler);
router.delete("/:id", revokeApiKeyHandler);

export const apiKeyRouter = router;
