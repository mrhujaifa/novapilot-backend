import "express";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        privyUserId: string;
        circleWalletId: string | null;
        walletAddress: string | null;
        network: string;
      };
    }
  }
}
