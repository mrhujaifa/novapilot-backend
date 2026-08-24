import { Router } from "express";
import { handleProxyRequest } from "./proxy.controller";

const router = Router();

// Wildcard — consumer যেকোনো path দিতে পারবে
router.all("/:slug/*path", handleProxyRequest);
router.all("/:slug", handleProxyRequest);

export const proxyRouter = router;
