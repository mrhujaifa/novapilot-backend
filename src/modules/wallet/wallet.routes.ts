import { Router } from "express";

import { requireAuth } from "../auth/auth.middleware";
import { getBalance, listTransactions } from "./wallet.controller";

const router = Router();

/**
 * Wallet endpoints.
 * All routes require an authenticated user.
 */
router.use(requireAuth);

router.get("/balance", getBalance);
router.get("/transactions", listTransactions);

export const walletRouter = router;
