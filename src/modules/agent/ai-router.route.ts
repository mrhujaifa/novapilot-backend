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

/**
 * Protect all AI chat routes.
 * Every endpoint below requires an authenticated user.
 */
router.use(requireAuth);

/**
 * Conversation management
 */
router.post("/conversations", createConversationHandler);
router.get("/conversations", listConversationsHandler);
router.get("/conversations/:id", getConversationHandler);
router.patch("/conversations/:id", renameConversationHandler);
router.delete("/conversations/:id", deleteConversationHandler);

/**
 * Conversation messages
 */
router.get("/conversations/:id/messages", getMessagesHandler);
router.post("/conversations/:id/messages", sendMessageHandler);

export const aiRouter = router;
