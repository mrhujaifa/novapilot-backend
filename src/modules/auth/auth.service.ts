import { privy } from "../../lib/privy";
import { prisma } from "../../lib/prisma";
import { logger } from "../../lib/logger";
import { AppError } from "../../utils/AppError";
import { StatusCodes } from "http-status-codes";
import { createCircleWallet } from "../wallet/wallet.service";
import { User } from "../../generated/prisma/client";

// step 1: verify Privy token, return the userId (Privy DID) inside it
export async function verifyIdentity(token: string): Promise<string> {
  try {
    const claims = await privy.verifyAuthToken(token);
    return claims.userId;
  } catch (err) {
    logger.warn({ err }, "Privy token verification failed");
    throw new AppError(StatusCodes.UNAUTHORIZED, "Invalid or expired token");
  }
}

// step 2: find existing user by Privy id, or create a new row (wallet fields empty at first)
export async function findOrCreateUser(privyUserId: string): Promise<User> {
  return prisma.user.upsert({
    where: { privyUserId },
    update: {},
    create: { privyUserId },
  });
}

// step 3: ensure user has a Circle wallet, race-condition safe
// uses a Postgres row lock so two concurrent requests for the same user
// cannot both pass the "no wallet yet" check at the same time
export async function ensureWallet(userId: string): Promise<User> {
  // everything inside this transaction runs against a locked row
  return prisma.$transaction(async (tx) => {
    // FOR UPDATE locks this user's row until the transaction ends
    // any other transaction trying to read/lock the same row will wait here
    const [lockedUser] = await tx.$queryRaw<User[]>`
      SELECT * FROM "User" WHERE id = ${userId} FOR UPDATE
    `;

    if (!lockedUser) {
      throw new AppError(StatusCodes.NOT_FOUND, "User not found");
    }

    // second concurrent request will see this as already true, since it
    // waited for the first transaction to commit before reaching this line
    if (lockedUser.circleWalletId) {
      return lockedUser; // wallet already exists, nothing to do
    }

    // only ONE request at a time can reach this point per user
    const { circleWalletId, walletAddress } = await createCircleWallet(userId);

    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: { circleWalletId, walletAddress },
    });

    return updatedUser;
  });
}
