import { afterEach, describe, expect, it, vi } from "vitest";
import { browseMarketplaceSchema, createApiReportSchema } from "../src/modules/marketplace/consumer/consumer.schema";
import { withdrawalSchema } from "../src/modules/marketplace/withdrawal/withdrawal.schema";
import { buildRequest } from "../src/modules/marketplace/proxy/request-builder";
import { proxyEndpointFor } from "../src/modules/marketplace/shared/proxy-endpoint";

afterEach(() => vi.unstubAllEnvs());

describe("marketplace input and request regressions", () => {
  it.each([{ page: -1 }, { page: 0 }, { page: 1.5 }, { limit: 0 }, { limit: -1 }, { limit: 1.5 }])("rejects invalid pagination %j", (input) => {
    expect(browseMarketplaceSchema.safeParse(input).success).toBe(false);
  });
  it("keeps provider query credentials above consumer-supplied query parameters", () => {
    const request = buildRequest("https://example.com", { method: "GET", pathTemplate: "/items" }, { query: { api_key: "provider-key" }, headers: {}, pathVars: {} }, "/", { api_key: "override", page: "2" }, {}, undefined);
    expect(new URL(request.url).searchParams.get("api_key")).toBe("provider-key");
    expect(new URL(request.url).searchParams.get("page")).toBe("2");
  });
  it("resolves dynamic values without exposing provider credential path segments to consumers", () => {
    const request = buildRequest("https://example.com", { method: "GET", pathTemplate: "/v6/{apiKey}/latest/{base}" }, { query: {}, headers: {}, pathVars: { apiKey: "provider-secret" } }, "/v6/latest/USD", {}, {}, undefined);
    expect(request.url).toBe("https://example.com/v6/provider-secret/latest/USD");
  });
  it.each(["https://example.com", "https://example.com/", "https://example.com/api", "https://example.com/api/v1/marketplace"]) ("uses the mounted proxy route for base %s", (base) => {
    vi.stubEnv("PROXY_BASE_URL", base);
    expect(proxyEndpointFor("test-api")).toBe("https://example.com/api/v1/marketplace/test-api");
  });
  it.each(["BROKEN_API", "INCORRECT_INFORMATION", "SECURITY_ISSUE", "ABUSE", "OTHER"])("accepts frontend report reason %s without losing its description", (reason) => {
    expect(createApiReportSchema.parse({ reason, description: "Example details" }).description).toBe("Example details");
  });
  it.each(["not-an-address", "0x1234567890", `0x${"0".repeat(40)}`])("rejects invalid withdrawal destination %s", (destinationAddress) => {
    expect(withdrawalSchema.safeParse({ amountUsdc: 1, destinationAddress }).success).toBe(false);
  });
  it("rejects withdrawal amounts smaller than a micro-USDC denomination", () => {
    expect(withdrawalSchema.safeParse({ amountUsdc: 1.0000001, destinationAddress: `0x${"1".repeat(40)}` }).success).toBe(false);
  });
});
