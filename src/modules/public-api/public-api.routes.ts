// src/modules/public-api/public-api.routes.ts

import { Router } from "express";
import { publicChatHandler } from "./public-chat.controller";
import { requireApiKey } from "../api/api-key.middleware";

const router = Router();

router.post("/v1/chat", requireApiKey, publicChatHandler);

export const PublicApiRoutes = router;
