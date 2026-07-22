import { env } from "../config/env.config";
import { PrivyClient } from "@privy-io/server-auth";

export const privy = new PrivyClient(env.PRIVY_APP_ID, env.PRIVY_APP_SECRET);
