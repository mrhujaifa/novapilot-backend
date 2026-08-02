import { Router } from "express";

import { publicChatHandler } from "./public-chat.controller";
import { requireApiKey } from "../api/api-key.middleware";

const router = Router();

/**
 * Public API endpoints.
 * Requests are authenticated using an API key.
 */
router.post("/chat", requireApiKey, publicChatHandler);

export const publicApiRouter = router;
