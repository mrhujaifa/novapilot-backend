import { circleClient } from "../../lib/circle";
import { env } from "../../config/env.config";
import { logger } from "../../lib/logger";
import { AppError } from "../../utils/AppError";
import { StatusCodes } from "http-status-codes";
import { CreatedWallet } from "./wallet.type";
import { prisma } from "../../lib/prisma";

// Maps our internal network env to Circle's blockchain identifier.
// This is the ONLY place that needs to change for testnet -> mainnet migration.
// NOTE: confirm actual Arc network identifier with Circle docs before mainnet launch.

// const getCircleBlockchain = env.CHAIN_ENV === "mainnet" ? "ETH" : "ETH-SEPOLIA";
// The Wallet Set is created ONCE for the whole app (via a one-time setup script),
// not per user. Its ID must be stored in env so every wallet creation call reuses it.
function getWalletSetId(): string {
  if (!env.CIRCLE_WALLET_SET_ID) {
    throw new AppError(
      StatusCodes.INTERNAL_SERVER_ERROR,
      "CIRCLE_WALLET_SET_ID is not configured — run the wallet-set setup script first",
    );
  }
  return env.CIRCLE_WALLET_SET_ID;
}

/**
 * Creates a single new Circle wallet for a user under the shared Wallet Set.
 * Idempotent: if a wallet already exists for this user (in our DB), returns
 * it instead of creating a duplicate Circle wallet.
 */
export async function createCircleWallet(userId: string): Promise<CreatedWallet> {
  const existing = await prisma.wallet.findUnique({
    where: {
      userId_network: { userId, network: env.CHAIN_ENV === "mainnet" ? "MAINNET" : "TESTNET" },
    },
  });
  if (existing) {
    return { circleWalletId: existing.circleWalletId, walletAddress: existing.address };
  }

  try {
    const response = await circleClient.createWallets({
      accountType: "SCA", // Smart Contract Account, supports gas sponsorship later
      blockchains: ["ARC-TESTNET"],
      count: 1,
      walletSetId: getWalletSetId(),
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
