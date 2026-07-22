import { circleClient } from "../../lib/circle";
import { env } from "../../config/env.config";
import { logger } from "../../lib/logger";
import { AppError } from "../../utils/AppError";
import { StatusCodes } from "http-status-codes";
import { CreatedWallet } from "./wallet.type";

// maps our internal network env to Circle's blockchain identifier
// this is the ONLY place that needs to change for testnet -> mainnet migration
// TODO: i will fix it next production
function getCircleBlockchain(): string {
  return env.CHAIN_ENV === "mainnet" ? "ARB" : "ARB-SEPOLIA";
  // NOTE: confirm actual Arc network identifier with Circle docs before mainnet launch
}

// creates a single new wallet for a user under our shared Wallet Set
export async function createCircleWallet(userId: string): Promise<CreatedWallet> {
  try {
    const walletSetResponse = await circleClient.createWalletSet({
      name: "NovaPilot",
    });

    const walletSet = walletSetResponse.data?.walletSet;
    if (!walletSet?.id) {
      throw new Error("Wallet set creation failed: no ID returned");
    }

    const response = await circleClient.createWallets({
      accountType: "SCA", // Smart Contract Account, supports gas sponsorship later
      blockchains: ["ETH-SEPOLIA"],
      count: 1,
      walletSetId: walletSet.id,
      metadata: [{ refId: userId }], // links Circle wallet back to our internal user id
    });

    const wallet = response.data?.wallets?.[0];

    if (!wallet) {
      throw new AppError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "Circle wallet creation returned no wallet",
      );
    }

    return {
      circleWalletId: wallet.id,
      walletAddress: wallet.address,
    };
  } catch (err) {
    logger.error({ err, userId }, "Circle wallet creation failed");
    throw new AppError(StatusCodes.INTERNAL_SERVER_ERROR, "Failed to create wallet");
  }
}
