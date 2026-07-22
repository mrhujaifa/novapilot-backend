import { Response } from "express";
import { successResponse } from "../../utils/apiResponse";
import { AuthenticatedRequest } from "./auth.middleware";

// controller only formats and sends the response, no business logic here
export function getMe(req: AuthenticatedRequest, res: Response) {
  successResponse(res, { user: req.user });
}
