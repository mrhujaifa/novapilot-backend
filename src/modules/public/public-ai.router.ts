import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware";
import { openAiCompatHandler } from "./openai-compat.controller";
import { injectSessionAsApiContext } from "./session-api-context.middleware";

const router = Router();

// Dashboard UI — session auth
// injectSessionAsApiContext → req.apiKeyContext কে session থেকে populate করে
// controller same থাকে — apiKeyContext expect করে, source জানে না
router.post(
  "/chat/completions",
  requireAuth,
  injectSessionAsApiContext,
  openAiCompatHandler,
);

export const publicAiRouter = router;
