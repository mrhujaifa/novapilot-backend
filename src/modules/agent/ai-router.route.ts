import { Router } from "express";

import {
  createConversationHandler,
  listConversationsHandler,
  getConversationHandler,
  getMessagesHandler,
  sendMessageHandler,
  renameConversationHandler,
  deleteConversationHandler,
} from "./ai-router.controller";
import { requireAuth } from "../auth/auth.middleware";

const router = Router();

router.use(requireAuth);

router.post("/conversations", createConversationHandler);
router.get("/conversations", listConversationsHandler);
router.get("/conversations/:id", getConversationHandler);
router.patch("/conversations/:id", renameConversationHandler);
router.delete("/conversations/:id", deleteConversationHandler);

router.get("/conversations/:id/messages", getMessagesHandler);
router.post("/conversations/:id/messages", sendMessageHandler);

export const AiRouters = router;
