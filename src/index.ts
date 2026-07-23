/* eslint-disable @typescript-eslint/no-explicit-any */
import express from "express";
import helmet from "helmet";
import cors from "cors";
import { env } from "./config/env.config";
import { errorHandler } from "./middlewares/errorHandler";
import { indexRouters } from "./routers";

export const app = express();

app.use(helmet());

const allowedOrigins = env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim());

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);

app.use(
  "/api/billing/webhook",
  express.json({
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf;
    },
  }),
);
app.use(express.json());

app.use("/api/v1/", indexRouters);

app.use(errorHandler);
