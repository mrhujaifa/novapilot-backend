import { Router } from "express";
import { handleGetModels } from "./models.controller";

export const modelsRouter = Router();

// Public — no auth needed to browse available models before signing up
modelsRouter.get("/api/models", handleGetModels);
