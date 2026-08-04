import { Response, NextFunction, Request } from "express";
import { StatusCodes } from "http-status-codes";
import { AppError } from "../../errors/AppError";
import { verifyIdentity, findOrCreateUser, ensureWallet } from "./auth.service";
import { asyncHandler } from "../../utils/asyncHandler";
import { ErrorCodes } from "../../errors/error-codes";

// This middleware only orchestrates the flow — real logic lives in auth.service.ts.
export const requireAuth = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      throw new AppError(
        StatusCodes.UNAUTHORIZED,
        "Authentication credentials were not provided.",
        ErrorCodes.AUTH_UNAUTHORIZED,
      );
    }

    const token = authHeader.slice(7).trim();

    const privyUserId = await verifyIdentity(token);
    const user = await findOrCreateUser(privyUserId);
    const wallet = await ensureWallet(user.id); // returns a Wallet row, not a User row

    req.user = {
      id: user.id,
      privyUserId: user.privyUserId,
      circleWalletId: wallet.circleWalletId,
      walletAddress: wallet.address, // Wallet model calls this field "address"
      network: wallet.network,
    };

    next();
  },
);
