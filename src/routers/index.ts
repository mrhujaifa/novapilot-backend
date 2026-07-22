import { Router } from "express";
import { AuthRoutes } from "../modules/auth/auth.routes";

const router = Router();

router.use("/auth", AuthRoutes);

export const indexRouters = router;
