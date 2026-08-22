import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { z } from "zod";

const envFiles = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "..", ".env"),
];

for (const envFile of envFiles) {
  if (fs.existsSync(envFile)) {
    dotenv.config({ path: envFile });
    break;
  }
}

// Treats an empty string the same as "not set" — .env files often have
// blank placeholder lines (e.g. `ANTHROPIC_API_KEY=`) rather than omitting the key.
const optionalKey = () =>
  z
    .string()
    .optional()
    .transform((v) => (v === "" ? undefined : v));

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(4000),

  PRIVY_APP_ID: z.string().min(1), // identity/login only now
  PRIVY_APP_SECRET: z.string().min(1),

  CIRCLE_API_KEY: z.string().min(1), // Circle Developer-Controlled Wallets
  CIRCLE_ENTITY_SECRET: z.string().min(1),
  CIRCLE_WALLET_SET_ID: z.string(),
  CHAIN_ENV: z.enum(["TESTNET", "MAINNET"]).default("TESTNET"), // controls which Circle blockchain to use
  ALLOWED_ORIGINS: z.string().min(1), // cors allow
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  // AI Router — at least one provider key is required, checked below (not per-field,
  // since which providers are "required" depends on which models you enable).
  ANTHROPIC_API_KEY: optionalKey(),
  OPENAI_API_KEY: optionalKey(),
  GOOGLE_GENERATIVE_AI_API_KEY: optionalKey(),
  OPENROUTER_API_KEY: optionalKey(),
  ADMIN_CIRCLE_WALLET_ID: z.string().min(1),
  ADMIN_CIRCLE_WALLET_ADDRESS: z.string().startsWith("0x"),
  USDC_CONTRACT_ADDRESS: z.string().startsWith("0x"),
  SWEEP_THRESHOLD_USDC: z.string().default("0.20"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "[ERROR]",
    "Environment validation failed:",
    parsed.error.flatten().fieldErrors,
  );
  process.exit(1);
}

// At least one AI provider key must be present, otherwise /api/chat can never work
const hasAnyProviderKey = [
  parsed.data.ANTHROPIC_API_KEY,
  parsed.data.OPENAI_API_KEY,
  parsed.data.GOOGLE_GENERATIVE_AI_API_KEY,
  parsed.data.OPENROUTER_API_KEY,
].some(Boolean);

if (!hasAnyProviderKey) {
  console.error(
    "[ERROR] No AI provider API key configured. Set at least one of: " +
      "ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, OPENROUTER_API_KEY",
  );
  process.exit(1);
}

export const env = parsed.data;
