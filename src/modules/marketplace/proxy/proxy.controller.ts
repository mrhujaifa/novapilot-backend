import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import { proxyRequest } from "./proxy.service";

export const handleProxyRequest = asyncHandler(
  async (req: Request, res: Response) => {
    const slug = req.params.slug;

    await proxyRequest(req, res, slug as string);
  },
);
