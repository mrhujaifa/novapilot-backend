import { privy } from "../../lib/privy";
import { prisma } from "../../lib/prisma";
import { logger } from "../../lib/logger";
import { AppError } from "../../errors/AppError";
import { StatusCodes } from "http-status-codes";
import { createCircleWallet } from "../wallet/wallet.service";
import { NetworkEnv, User, Wallet } from "../../generated/prisma/client";
import { env } from "../../config/env.config";
import { initializeBalance } from "../billing/balance-init.service";
import { ErrorCodes } from "../../errors/error-codes";

const CURRENT_NETWORK: NetworkEnv =
  env.CHAIN_ENV === "MAINNET" ? "MAINNET" : "TESTNET";

// step 1: verify Privy token, return the userId (Privy DID) inside it
export async function verifyIdentity(token: string): Promise<string> {
  try {
    const claims = await privy.verifyAuthToken(token);
    return claims.userId;
  } catch (err) {
    logger.warn({ err }, "Privy token verification failed");
    throw new AppError(
      StatusCodes.UNAUTHORIZED,
      "Invalid or expired token",
      ErrorCodes.AUTH_INVALID_TOKEN,
    );
  }
}

// step 2: find existing user by Privy id, or create a new row
export async function findOrCreateUser(privyUserId: string): Promise<User> {
  return prisma.user.upsert({
    where: { privyUserId },
    update: {},
    create: { privyUserId },
  });
}

/**
 * Ensures a user has a Circle wallet + initialized balance for the current network.
 *
 * Design notes:
 * - The external Circle API call happens OUTSIDE any DB transaction/lock —
 *   holding a Postgres row lock across a slow network call would exhaust the
 *   connection pool under load. This is the classic "no I/O inside a DB
 *   transaction" rule.
 * - Duplicate-safety comes from the DB's unique constraint on
 *   (userId, network), not from a lock. In the rare case where two concurrent
 *   requests both pass the initial "no wallet yet" check and both call
 *   Circle, the second DB insert will violate the unique constraint — we
 *   catch that, discard the orphaned Circle wallet reference, and return the
 *   winning row instead. This trades a rare orphaned Circle wallet for never
 *   blocking the DB on external latency.
 */
export async function ensureWallet(userId: string): Promise<Wallet> {
  const existing = await prisma.wallet.findUnique({
    where: { userId_network: { userId, network: CURRENT_NETWORK } },
  });
  if (existing) {
    return existing;
  }

  const { circleWalletId, walletAddress } = await createCircleWallet(userId);

  try {
    const wallet = await prisma.$transaction(async (tx) => {
      const created = await tx.wallet.create({
        data: {
          userId,
          circleWalletId,
          address: walletAddress,
          network: CURRENT_NETWORK,
        },
      });

      // Balance row must exist before any deposit/deduct call can succeed
      await initializeBalance(userId, CURRENT_NETWORK);

      return created;
    });

    return wallet;
  } catch (err) {
    // Unique constraint violation (P2002) — another concurrent request won the race.
    // The Circle wallet we just created is orphaned (never persisted), which is an
    // acceptable, rare trade-off. Return the row that actually made it into the DB.
    const existingAfterRace = await prisma.wallet.findUnique({
      where: { userId_network: { userId, network: CURRENT_NETWORK } },
    });
    if (existingAfterRace) {
      logger.warn(
        { userId, orphanedCircleWalletId: circleWalletId },
        "Lost wallet-creation race — discarding orphaned Circle wallet",
      );
      return existingAfterRace;
    }

    logger.error(
      {
        err,
        userId,
      },
      "Failed to ensure wallet",
    );

    throw err;
  }
}
