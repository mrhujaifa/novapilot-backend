import { Response, NextFunction, Request } from "express";
import { StatusCodes } from "http-status-codes";
import { AppError } from "../../utils/AppError";
import { asyncHandler } from "../../utils/asyncHandler";
import { verifyIdentity, findOrCreateUser, ensureWallet } from "./auth.service";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    privyUserId: string;
    circleWalletId: string;
    walletAddress: string;
    network: string;
  };
}

// this middleware only orchestrates the flow, all real logic lives in auth.service.ts
export const requireAuth = asyncHandler<AuthenticatedRequest>(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "Unauthorized access");
    }

    const token = authHeader.slice(7).trim();

    const privyUserId = await verifyIdentity(token);
    const user = await findOrCreateUser(privyUserId);
    const wallet = await ensureWallet(user.id); // returns a Wallet row, not a User row

    req.user = {
      id: user.id,
      privyUserId: user.privyUserId,
      circleWalletId: wallet.circleWalletId,
      walletAddress: wallet.address, // Wallet model calls this field "address", not "walletAddress"
      network: wallet.network,
    };

    next();
  },
);
