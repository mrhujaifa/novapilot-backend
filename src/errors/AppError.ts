import type { ErrorCode } from "./error-codes";

export class AppError extends Error {
  public readonly status: number;
  public readonly code: ErrorCode;
  public readonly details?: unknown;
  public readonly isOperational: boolean;
  public readonly expose: boolean;
  public readonly cause?: unknown;

  constructor(
    status: number,
    message: string,
    code: ErrorCode,
    options?: {
      details?: unknown;
      expose?: boolean;
      cause?: unknown;
    },
  ) {
    super(message);

    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = options?.details;
    this.expose = options?.expose ?? status < 500;
    this.cause = options?.cause;
    this.isOperational = true;

    Error.captureStackTrace?.(this, this.constructor);
  }
}
