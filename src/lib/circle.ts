import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { env } from "../config/env.config.js";

// Singleton — avoid a new connection/auth handshake on every request.
export const circleClient = initiateDeveloperControlledWalletsClient({
  apiKey: env.CIRCLE_API_KEY,
  entitySecret: env.CIRCLE_ENTITY_SECRET, // SDK encrypts this before sending
});

export type CircleClient = typeof circleClient;
