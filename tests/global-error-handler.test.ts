import type { NextFunction, Request, Response } from "express";
import { expect, it, vi } from "vitest";

vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));
vi.mock("../src/utils/sendApiResponse", () => ({ sendApiResponse: vi.fn() }));

import { globalErrorHandler } from "../src/errors/global-error-handler";
import { logger } from "../src/lib/logger";

it("logs errors with route context without exposing request credentials", () => {
  const error = new Error("Unexpected failure");
  globalErrorHandler(
    error,
    {
      originalUrl: "/api/marketplace/creator/apis",
      method: "POST",
      body: { credentialValue: "test-secret", nested: { password: "test-password" } },
    } as Request,
    {} as Response,
    vi.fn() as NextFunction,
  );
  expect(logger.error).toHaveBeenCalledWith(
    { err: error, path: "/api/marketplace/creator/apis", method: "POST" },
    "Unhandled application error",
  );
  const logs = JSON.stringify(vi.mocked(logger.error).mock.calls);
  expect(logs).not.toContain("test-secret");
  expect(logs).not.toContain("test-password");
});
