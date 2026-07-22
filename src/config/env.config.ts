import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { z } from "zod";

const envFiles = [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "..", ".env")];

for (const envFile of envFiles) {
  if (fs.existsSync(envFile)) {
    dotenv.config({ path: envFile });
    break;
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),
  PRIVY_APP_ID: z.string().min(1).optional(),
  PRIVY_APP_SECRET: z.string().min(1).optional(), // server verification key/secret
  DATABASE_URL: z.string().min(1).optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("[ERROR]", "Environment validation failed:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const missingOptionalEnv = ["PRIVY_APP_ID", "PRIVY_APP_SECRET", "DATABASE_URL"].filter(
  (key) => !parsed.data[key as keyof typeof parsed.data],
);

if (missingOptionalEnv.length > 0 && parsed.data.NODE_ENV !== "production") {
  console.warn(
    `[WARN] Missing optional env vars: ${missingOptionalEnv.join(", ")}. The app will start in development mode with empty values.`,
  );
}

export const env = {
  ...parsed.data,
  PRIVY_APP_ID: parsed.data.PRIVY_APP_ID ?? "",
  PRIVY_APP_SECRET: parsed.data.PRIVY_APP_SECRET ?? "",
  DATABASE_URL: parsed.data.DATABASE_URL ?? "",
};
