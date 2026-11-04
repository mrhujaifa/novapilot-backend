import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/logger", () => ({ logger: { error: vi.fn() } }));

import { applyAuth, encryptCredential } from "../src/modules/marketplace/proxy/auth-engine";
import { logger } from "../src/lib/logger";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("marketplace credential encryption", () => {
  it.each([undefined, "", "ab", "g".repeat(64), "ab".repeat(31), "ab".repeat(33)])(
    "returns a configuration error for an invalid key: %s",
    (value) => {
      vi.stubEnv("ENCRYPTION_KEY", value);
      expect(() => encryptCredential({ token: "test-secret" })).toThrow(
        expect.objectContaining({ status: 503, code: "SERVICE_UNAVAILABLE" }),
      );
      const logs = JSON.stringify(vi.mocked(logger.error).mock.calls);
      expect(logs).toContain("ENCRYPTION_KEY");
      expect(logs).not.toContain("test-secret");
    },
  );

  it("encrypts and decrypts existing AES-256-CBC credentials with the same key", () => {
    vi.stubEnv("ENCRYPTION_KEY", "ab".repeat(32));
    const encrypted = encryptCredential({ token: "test-secret" });
    expect(encrypted).not.toContain("test-secret");
    expect(applyAuth({ type: "bearer" }, encrypted).headers).toEqual({
      Authorization: "Bearer test-secret",
    });
    expect(encryptCredential({ token: "test-secret" })).not.toBe(encrypted);
  });

  it("reports a missing key on decryption as well", () => {
    vi.stubEnv("ENCRYPTION_KEY", "ab".repeat(32));
    const encrypted = encryptCredential({ token: "test-secret" });
    vi.stubEnv("ENCRYPTION_KEY", undefined);
    expect(() => applyAuth({ type: "bearer" }, encrypted)).toThrow(
      expect.objectContaining({ status: 503 }),
    );
  });

  it("does not require an encryption key for unauthenticated upstream APIs", () => {
    vi.stubEnv("ENCRYPTION_KEY", undefined);
    expect(applyAuth({ type: "none" }, null)).toEqual({
      headers: {}, query: {}, pathVars: {},
    });
  });
});
