import { Router } from "express";
import { requireApiKey } from "../api/api-key.middleware";
import { publicChatHandler } from "./public-chat.controller";
import { openAiCompatHandler } from "./openai-compat.controller";

const router = Router();

router.use(requireApiKey);

// Original stateless endpoint — untouched
router.post("/chat", publicChatHandler);

// OpenAI-compatible — all features
// NOT wrapped in asyncHandler — error handling is explicit inside
router.post("/chat/completions", openAiCompatHandler);

export const publicApiRouter = router;
