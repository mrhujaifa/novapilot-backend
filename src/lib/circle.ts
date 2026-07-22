import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { env } from "../config/env.config.js";

// single Circle client instance, reused everywhere (same singleton pattern as prisma/privy)
export const circleClient = initiateDeveloperControlledWalletsClient({
  apiKey: env.CIRCLE_API_KEY,
  entitySecret: env.CIRCLE_ENTITY_SECRET, // raw entity secret, SDK handles encryption internally
});
