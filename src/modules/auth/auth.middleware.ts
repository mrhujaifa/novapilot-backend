import { Response, NextFunction, Request } from "express";
import { StatusCodes } from "http-status-codes";
import { AppError } from "../../utils/AppError";
import { asyncHandler } from "../../utils/asyncHandler";
import { verifyIdentity, findOrCreateUser, ensureWallet } from "./auth.service";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    privyUserId: string;
    circleWalletId: string | null;
    walletAddress: string | null;
    network: string;
  };
}

// this middleware only orchestrates the flow, all real logic lives in auth.service.ts
export const requireAuth = asyncHandler(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "Unauthorized access");
    }

    const token = authHeader.slice(7).trim();

    const privyUserId = await verifyIdentity(token);
    const user = await findOrCreateUser(privyUserId);
    const finalUser = await ensureWallet(user.id);

    req.user = {
      id: finalUser.id,
      privyUserId: finalUser.privyUserId,
      circleWalletId: finalUser.circleWalletId,
      walletAddress: finalUser.walletAddress,
      network: finalUser.network,
    };

    next();
  },
);
