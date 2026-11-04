import { beforeEach, describe, expect, it, vi } from "vitest";

const { evalCommand } = vi.hoisted(() => ({ evalCommand: vi.fn() }));
vi.mock("../src/lib/redis", () => ({
  runRedisCommand: (command: (client: unknown) => Promise<unknown>) =>
    command({ eval: evalCommand }),
}));

import { enforceApiKeyRateLimit } from "../src/modules/api/api-key.rate-limit";

beforeEach(() => {
  evalCommand.mockReset();
});

describe("API key rate limit", () => {
  it("uses one atomic command for the counter and expiry", async () => {
    evalCommand.mockResolvedValue(1);
    await enforceApiKeyRateLimit("example-key", null);
    expect(evalCommand).toHaveBeenCalledTimes(1);
    expect(evalCommand).toHaveBeenCalledWith(
      expect.stringMatching(/INCR[\s\S]*EXPIRE/),
      { keys: ["ratelimit:apikey:example-key"], arguments: ["60"] },
    );
  });

  it("allows the last request in the window and rejects requests above the limit", async () => {
    evalCommand.mockResolvedValueOnce(2).mockResolvedValueOnce(3);
    await expect(enforceApiKeyRateLimit("key", 2)).resolves.toBeUndefined();
    await expect(enforceApiKeyRateLimit("key", 2)).rejects.toMatchObject({
      status: 429, code: "API_KEY_RATE_LIMIT_EXCEEDED",
    });
  });

  it("keeps rate limiting closed when Redis is unavailable", async () => {
    const failure = new Error("Redis unavailable");
    evalCommand.mockRejectedValue(failure);
    await expect(enforceApiKeyRateLimit("key", null)).rejects.toBe(failure);
    expect(evalCommand).toHaveBeenCalledTimes(1);
  });
});
