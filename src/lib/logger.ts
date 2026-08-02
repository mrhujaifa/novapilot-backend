import pino from "pino";
import { env } from "../config/env.config.js";

export const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  // pino-pretty is dev-only — production logs stay structured JSON for log aggregators
  transport:
    env.NODE_ENV !== "production"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
});
