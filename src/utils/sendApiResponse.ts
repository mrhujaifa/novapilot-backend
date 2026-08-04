import { Response } from "express";
import type { ErrorCode } from "../errors/error-codes"; // adjust path to match your actual error-codes.ts location

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// Discriminated union on `success` — TypeScript now forces the shape to
// match the flag. You literally cannot construct { success: true, data: undefined }
// or { success: false, data: someValue } — the compiler rejects it.
type ApiResponseData<T> =
  | {
      httpStatusCode: number;
      success: true;
      message: string;
      data: T;
      meta?: PaginationMeta;
    }
  | {
      httpStatusCode: number;
      success: false;
      message: string;
      code?: ErrorCode;
      details?: unknown;
    };

export const sendApiResponse = <T>(
  res: Response,
  responseData: ApiResponseData<T>,
): void => {
  const { httpStatusCode } = responseData;

  if (responseData.success) {
    res.status(httpStatusCode).json({
      success: true,
      message: responseData.message,
      data: responseData.data,
      ...(responseData.meta && { meta: responseData.meta }),
    });
    return;
  }

  res.status(httpStatusCode).json({
    success: false,
    message: responseData.message,
    ...(responseData.code && { code: responseData.code }),
    ...(responseData.details !== undefined && {
      details: responseData.details,
    }),
  });
};
