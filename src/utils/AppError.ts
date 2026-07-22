export class AppError extends Error {
  public readonly status: number;
  public readonly isOperational: boolean;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}
