import { Request, Response } from "express";
import { successResponse } from "../../utils/apiResponse";

// controller only formats and sends the response, no business logic here
export function getMe(req: Request, res: Response) {
  successResponse(res, { user: req.user });
}
