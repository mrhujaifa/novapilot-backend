import { NetworkEnv } from "../generated/prisma";
import { env } from "./env.config";

export const CURRENT_NETWORK =
  env.CHAIN_ENV === "mainnet" ? NetworkEnv.MAINNET : NetworkEnv.TESTNET;
