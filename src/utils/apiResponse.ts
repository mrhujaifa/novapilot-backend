import { Response } from "express";
import { StatusCodes } from "http-status-codes";

export function errorResponse(res: Response, status: number, message: string) {
  return res.status(status).json({ success: false, status, message });
}

export function successResponse<T>(res: Response, data: T, status: number = StatusCodes.OK) {
  return res.status(status).json({ success: true, status, data });
}
