// src/middleware/auth.ts
import { Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import { privy } from "../lib/privy";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { AppError } from "../utils/AppError";
import { asyncHandler } from "../utils/asyncHandler";
import { Request } from "express";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    privyUserId: string;
    walletAddress: string;
  };
}

// simple check: EVM address is always "0x" + 40 hex characters
// this rejects Solana (base58) or any non-EVM wallet format early
function isValidEvmAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export const requireAuth = asyncHandler(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "Unauthorized access");
    }

    const token = authHeader.slice(7).trim();

    let claims;
    try {
      claims = await privy.verifyAuthToken(token);
    } catch (err) {
      logger.warn({ err }, "Privy token verification failed");
      throw new AppError(StatusCodes.UNAUTHORIZED, "Invalid or expired token");
    }

    const privyUser = await privy.getUser(claims.userId);
    const walletAddress = privyUser.wallet?.address;

    if (!walletAddress) {
      throw new AppError(StatusCodes.FORBIDDEN, "No wallet linked to this account");
    }

    // reject non-EVM wallets, since Arc network only supports EVM addresses
    if (!isValidEvmAddress(walletAddress)) {
      logger.warn({ privyUserId: claims.userId, walletAddress }, "Non-EVM wallet rejected");
      throw new AppError(StatusCodes.FORBIDDEN, "Only EVM-compatible wallets are supported");
    }

    const user = await prisma.user.upsert({
      where: { privyId: claims.userId },
      update: {},
      create: {
        privyId: claims.userId,
      },
    });

    req.user = {
      id: user.id,
      privyUserId: claims.userId,
      walletAddress: walletAddress.toLowerCase(),
    };

    next();
  },
);
