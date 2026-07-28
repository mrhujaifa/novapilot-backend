import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware";
import { getBalance, listTransactions } from "./wallet.controller";

const router = Router();

router.use(requireAuth);

router.get("/balance", getBalance);
router.get("/transactions", listTransactions);

export const walletRoutes = router;
