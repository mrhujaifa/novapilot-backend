import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { registerEntitySecretCiphertext } from "@circle-fin/developer-controlled-wallets";

const apiKey: string | undefined =
  "TEST_API_KEY:ed9bcdfbc81fbfea534d636b3bedf72b:88f1f4aaa3eb2100fdf2fc2ad2de8eeb";
if (!apiKey) {
  throw new Error("CIRCLE_API_KEY is required. Set it in .env first.");
}

// Refuse to overwrite an existing entity secret in .env.
const existingEnv: string = existsSync(".env") ? readFileSync(".env", "utf8") : "";
if (/^CIRCLE_ENTITY_SECRET=/m.test(existingEnv)) {
  throw new Error("CIRCLE_ENTITY_SECRET already exists in .env. Refusing to overwrite it.");
}

// Generate a 32-byte entity secret. The SDK's generateEntitySecret() helper
// prints to stdout but doesn't return the value, so use crypto directly.
const entitySecret: string = randomBytes(32).toString("hex");
const recoveryFilePath: string = "./recovery";

mkdirSync(recoveryFilePath, { recursive: true });

registerEntitySecretCiphertext({
  apiKey,
  entitySecret,
  recoveryFileDownloadPath: recoveryFilePath,
});

// For production, prefer a secrets manager over .env.
appendFileSync(".env", `\nCIRCLE_ENTITY_SECRET=${entitySecret}\n`);

console.log("Entity secret registered.");
console.log(`Recovery file saved to a new file in: ${recoveryFilePath}`);
console.log("CIRCLE_ENTITY_SECRET added to .env");
