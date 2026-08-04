import { Request, Response, NextFunction } from "express";

// Wraps a route handler (sync or async) so a thrown error or rejected
// promise always reaches Express's error-handling middleware. Without
// this, a throw inside an async function is swallowed silently instead
// of hitting errorHandler.
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => unknown,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
