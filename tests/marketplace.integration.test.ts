import crypto from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const mocks = vi.hoisted(() => ({
  createTransaction: vi.fn(), getTransaction: vi.fn(), transport: vi.fn(),
  session: { userId: "" },
}));
vi.mock("../src/config/env.config", () => ({ env: {
  NODE_ENV: "test", DATABASE_URL: process.env.MARKETPLACE_TEST_DATABASE_URL ?? "postgresql://unused:unused@127.0.0.1:1/unused",
  CHAIN_ENV: "TESTNET", USDC_CONTRACT_ADDRESS: "0x0000000000000000000000000000000000000001",
  ADMIN_CIRCLE_WALLET_ADDRESS: "0x0000000000000000000000000000000000000002",
} }));
vi.mock("../src/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("../src/lib/circle", () => ({ circleClient: mocks }));
vi.mock("../src/modules/auth/auth.middleware", () => ({ requireAuth: (req: Request, _res: Response, next: () => void) => { req.user = { id: mocks.session.userId } as Request["user"]; next(); } }));
vi.mock("../src/modules/marketplace/proxy/security/ssrf.service", () => ({ validateSsrf: vi.fn() }));
vi.mock("../src/modules/marketplace/proxy/transport/http.transport", () => ({ executeHttpRequest: mocks.transport }));

import express from "express";
import { prisma } from "../src/lib/prisma";
import { consumerService } from "../src/modules/marketplace/consumer/consumer.service";
import { reserveUsage, finalizeUsage, refundUsage } from "../src/modules/marketplace/proxy/billing/usage.service";
import { proxyRequest } from "../src/modules/marketplace/proxy/proxy.service";
import { withdrawalService } from "../src/modules/marketplace/withdrawal/withdrawal.service";
import { processCreatorSettlement, processCreatorWithdrawal } from "../src/modules/marketplace/earnings/payout.job";
import { playgroundRouter } from "../src/modules/marketplace/proxy/playground.routes";
import { globalErrorHandler } from "../src/errors/global-error-handler";

const database = process.env.MARKETPLACE_TEST_DATABASE_URL;
const enabled = !!database && /^postgresql:\/\/[^/]+@127\.0\.0\.1:55439\/marketplace_tests(?:_[a-z0-9]+)?$/.test(database);

describe.runIf(enabled)("marketplace with an isolated PostgreSQL database and mocked Circle/upstream", () => {
  let userId: string, creatorId: string, apiId: string, priceId: string, keyId: string, secret: string;
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.PROXY_BASE_URL = "https://backend.example.com/";
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "User" CASCADE');
    const creatorUser = await prisma.user.create({ data: { privyUserId: crypto.randomUUID() } });
    const creator = await prisma.creatorProfile.create({ data: { userId: creatorUser.id } });
    creatorId = creator.id;
    const user = await prisma.user.create({ data: { privyUserId: crypto.randomUUID() } });
    userId = user.id;
    mocks.session.userId = userId;
    await prisma.balance.createMany({ data: [
      { userId, network: "TESTNET", amount: 1 }, { userId, network: "MAINNET", amount: 10 },
    ] });
    await prisma.wallet.create({ data: { userId, network: "TESTNET", address: "0x0000000000000000000000000000000000000003", circleWalletId: crypto.randomUUID() } });
    const api = await prisma.apiListing.create({ data: {
      creatorId, apiSlug: "test-api", apiName: "Test API", description: "A test marketplace endpoint", category: "Testing",
      targetBaseUrl: "https://upstream.example.com", proxyEndpointUrl: "https://old.example.com/v1/test-api",
      network: "TESTNET", status: "APPROVED", requestSpec: { method: "GET", pathTemplate: "/items/{id}" }, authSpec: { type: "none" },
    } });
    apiId = api.id;
    const price = await prisma.apiPriceVersion.create({ data: { apiId, costPer1kCalls: 1 } });
    priceId = price.id;
    secret = `nvpt_live_${crypto.randomBytes(32).toString("hex")}`;
    const key = await prisma.marketplaceConsumerKey.create({ data: { userId, apiId, keyPrefix: "nvpt_live_", keyHash: crypto.createHash("sha256").update(secret).digest("hex") } });
    keyId = key.id;
    await prisma.apiSubscription.create({ data: { userId, apiId, priceVersionId: priceId } });
    mocks.transport.mockImplementation((_built, res, complete) => { if (res.json) res.json({ ok: true }); complete(200, 5); });
    mocks.createTransaction.mockResolvedValue({ data: { id: "circle-transaction" } });
    mocks.getTransaction.mockResolvedValue({ data: { transaction: { state: "COMPLETE", txHash: "test-hash" } } });
  });
  afterAll(async () => { await prisma.$disconnect(); });
  const reserve = (cost = 0.75) => reserveUsage(keyId, userId, apiId, priceId, "TESTNET", cost);
  const balance = async (network: "TESTNET" | "MAINNET" = "TESTNET") => (await prisma.balance.findUniqueOrThrow({ where: { userId_network: { userId, network } } })).amount.toString();
  const request = () => ({ headers: { authorization: `Bearer ${secret}` }, params: { path: ["items", "42"] }, query: {} }) as unknown as Request;

  it("allows only one of two concurrent reservations that exceed available funds", async () => {
    const results = await Promise.allSettled([reserve(), reserve()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await balance()).toBe("0.25");
    expect(await balance("MAINNET")).toBe("10");
  });
  it("respects pending sweep funds", async () => {
    await prisma.balance.update({ where: { userId_network: { userId, network: "TESTNET" } }, data: { pendingSweepAmount: 0.5 } });
    await expect(reserve()).rejects.toMatchObject({ status: 402 });
    expect(await balance()).toBe("1");
  });
  it("refunds a reservation once on its original network", async () => {
    const usage = await reserve();
    await Promise.all([refundUsage(usage.id), refundUsage(usage.id)]);
    expect(await balance()).toBe("1");
    expect(await balance("MAINNET")).toBe("10");
  });
  it("does not mint money when refunding legacy reservations", async () => {
    const usage = await prisma.marketplaceUsageRecord.create({ data: {
      idempotencyKey: crypto.randomUUID(), consumerKeyId: keyId, apiId, priceVersionId: priceId,
      network: "TESTNET", status: "RESERVED", reservedAmountUsdc: 0.25,
    } });
    await refundUsage(usage.id);
    expect(await balance()).toBe("1");
  });
  it("debits legacy reservations only on their original network", async () => {
    const usage = await prisma.marketplaceUsageRecord.create({ data: {
      idempotencyKey: crypto.randomUUID(), consumerKeyId: keyId, apiId, priceVersionId: priceId,
      network: "TESTNET", status: "RESERVED", reservedAmountUsdc: 0.25,
    } });
    await finalizeUsage(usage.id, userId, apiId, 0.25, 5, 200);
    expect(await balance()).toBe("0.75");
    expect(await balance("MAINNET")).toBe("10");
  });
  it("finalizes once without a second debit or cross-network charge", async () => {
    const usage = await reserve(0.25);
    await Promise.all([finalizeUsage(usage.id, userId, apiId, 0.25, 5, 200), finalizeUsage(usage.id, userId, apiId, 0.25, 5, 200)]);
    await refundUsage(usage.id);
    expect(await balance()).toBe("0.75");
    expect(await balance("MAINNET")).toBe("10");
    expect(await prisma.creatorEarningSettlement.count()).toBe(1);
    expect((await prisma.creatorProfile.findUniqueOrThrow({ where: { id: creatorId } })).pendingBalanceUsdc.toString()).toBe("0.245");
  });
  it("blocks paused subscriptions before reserving funds or forwarding", async () => {
    await consumerService.updateSubscription(userId, "test-api", { action: "PAUSE" });
    await expect(proxyRequest(request(), {} as Response, "test-api")).rejects.toMatchObject({ status: 403 });
    expect(mocks.transport).not.toHaveBeenCalled();
    expect(await balance()).toBe("1");
  });
  it("preserves Express 5 dynamic paths and finalizes proxy usage", async () => {
    await proxyRequest(request(), {} as Response, "test-api");
    expect(mocks.transport.mock.calls[0][0].url).toBe("https://upstream.example.com/items/42");
    expect(await balance()).toBe("0.999");
    expect(await prisma.marketplaceUsageRecord.count({ where: { status: "COMPLETED" } })).toBe(1);
  });
  it("refunds when upstream transport fails", async () => {
    mocks.transport.mockImplementation((_built, _res, _complete, fail) => fail(new Error("Upstream disconnected")));
    await expect(proxyRequest(request(), {} as Response, "test-api")).rejects.toThrow("Upstream disconnected");
    expect(await balance()).toBe("1");
    expect(await prisma.marketplaceUsageRecord.count({ where: { status: "REFUNDED" } })).toBe(1);
  });
  it("cancels a paused subscription, revokes its key, and supports resubscription", async () => {
    await consumerService.updateSubscription(userId, "test-api", { action: "PAUSE" });
    await consumerService.unsubscribeFromApi(userId, "test-api");
    const subscribed = await consumerService.subscribeToApi(userId, "test-api");
    expect(subscribed.apiKey).not.toBe(secret);
    expect(subscribed.proxyEndpointUrl).toBe("https://backend.example.com/api/v1/marketplace/test-api");
    expect(await prisma.apiSubscription.count()).toBe(1);
    expect(await prisma.marketplaceConsumerKey.count({ where: { status: "ACTIVE" } })).toBe(1);
  });
  it("issues only one key for concurrent resubscriptions", async () => {
    await consumerService.unsubscribeFromApi(userId, "test-api");
    const results = await Promise.allSettled([consumerService.subscribeToApi(userId, "test-api"), consumerService.subscribeToApi(userId, "test-api")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.marketplaceConsumerKey.count({ where: { status: "ACTIVE" } })).toBe(1);
  });
  it("issues only one key for concurrent first-time subscriptions", async () => {
    await prisma.apiSubscription.deleteMany();
    await prisma.marketplaceConsumerKey.deleteMany();
    const results = await Promise.allSettled([consumerService.subscribeToApi(userId, "test-api"), consumerService.subscribeToApi(userId, "test-api")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.marketplaceConsumerKey.count({ where: { status: "ACTIVE" } })).toBe(1);
  });
  it("sorts and paginates by the current numeric price", async () => {
    await prisma.apiListing.create({ data: {
      creatorId, apiSlug: "cheap-api", apiName: "Cheap API", description: "Another test marketplace endpoint", category: "Testing",
      targetBaseUrl: "https://upstream.example.com", proxyEndpointUrl: "https://old.example.com/v1/cheap-api", network: "TESTNET", status: "APPROVED",
      priceVersions: { create: [{ costPer1kCalls: 0.1 }, { costPer1kCalls: 50, isCurrent: false }] },
    } });
    const result = await consumerService.browseMarketplace({ sort: "price", page: 1, limit: 1 });
    expect(result.data[0].apiSlug).toBe("cheap-api");
    expect(result.pagination.total).toBe(2);
    expect(result.data[0].proxyEndpointUrl).toContain("/api/v1/marketplace/");
  });
  it("settles an earning only after Circle COMPLETE and does not credit twice", async () => {
    const usage = await reserve(0.5);
    await finalizeUsage(usage.id, userId, apiId, 0.5, 5, 200);
    const row = await prisma.creatorEarningSettlement.findFirstOrThrow();
    await processCreatorSettlement(row);
    await processCreatorSettlement(row);
    const creator = await prisma.creatorProfile.findUniqueOrThrow({ where: { id: creatorId } });
    expect(creator.availableBalanceUsdc.toString()).toBe("0.49");
    expect(creator.pendingBalanceUsdc.toString()).toBe("0");
    expect(mocks.createTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.createTransaction.mock.calls[0][0].amount).toEqual(["0.5"]);
    expect(mocks.createTransaction.mock.calls[0][0].idempotencyKey).toBe(row.idempotencyKey);
  });
  it("does not make unconfirmed earnings withdrawable", async () => {
    const usage = await reserve(0.5);
    await finalizeUsage(usage.id, userId, apiId, 0.5, 5, 200);
    mocks.getTransaction.mockResolvedValue({ data: { transaction: { state: "SENT" } } });
    await processCreatorSettlement(await prisma.creatorEarningSettlement.findFirstOrThrow());
    expect((await prisma.creatorProfile.findUniqueOrThrow({ where: { id: creatorId } })).availableBalanceUsdc.toString()).toBe("0");
  });
  it("freezes terminally failed collections instead of making them available", async () => {
    const usage = await reserve(0.5);
    await finalizeUsage(usage.id, userId, apiId, 0.5, 5, 200);
    mocks.getTransaction.mockResolvedValue({ data: { transaction: { state: "DENIED" } } });
    await processCreatorSettlement(await prisma.creatorEarningSettlement.findFirstOrThrow());
    const creator = await prisma.creatorProfile.findUniqueOrThrow({ where: { id: creatorId } });
    expect(creator.pendingBalanceUsdc.toString()).toBe("0");
    expect(creator.availableBalanceUsdc.toString()).toBe("0");
    expect(creator.frozenBalanceUsdc.toString()).toBe("0.49");
  });
  async function fundCreator() {
    await prisma.creatorProfile.update({ where: { id: creatorId }, data: { availableBalanceUsdc: 1.5 } });
    await prisma.creatorEarningSettlement.create({ data: { creatorId, network: "TESTNET", amountUsdc: 1.5, status: "SETTLED", idempotencyKey: crypto.randomUUID() } });
    return (await prisma.creatorProfile.findUniqueOrThrow({ where: { id: creatorId } })).userId;
  }
  const withdrawalInput = { amountUsdc: 1, destinationAddress: "0x0000000000000000000000000000000000000004" };
  it("allows only one concurrent withdrawal against the same available earnings", async () => {
    const creatorUser = await fundCreator();
    const results = await Promise.allSettled([withdrawalService.createWithdrawal(creatorUser, withdrawalInput), withdrawalService.createWithdrawal(creatorUser, withdrawalInput)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await prisma.creatorProfile.findUniqueOrThrow({ where: { id: creatorId } })).availableBalanceUsdc.toString()).toBe("0.5");
  });
  it("rejects withdrawal of earnings funded on another network", async () => {
    const creatorUser = await fundCreator();
    await prisma.creatorEarningSettlement.updateMany({ data: { network: "MAINNET" } });
    await expect(withdrawalService.createWithdrawal(creatorUser, withdrawalInput)).rejects.toMatchObject({ status: 400 });
    expect((await prisma.creatorProfile.findUniqueOrThrow({ where: { id: creatorId } })).availableBalanceUsdc.toString()).toBe("1.5");
  });
  it("executes a queued withdrawal with its persisted idempotency key", async () => {
    const creatorUser = await fundCreator();
    const row = await withdrawalService.createWithdrawal(creatorUser, withdrawalInput);
    await processCreatorWithdrawal(row);
    expect((await prisma.creatorWithdrawal.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("COMPLETED");
    expect(mocks.createTransaction.mock.calls[0][0].idempotencyKey).toBe(row.idempotencyKey);
    expect(mocks.createTransaction.mock.calls[0][0].destinationAddress).toBe(withdrawalInput.destinationAddress);
  });
  it("refunds terminally failed withdrawals exactly once", async () => {
    const creatorUser = await fundCreator();
    const row = await withdrawalService.createWithdrawal(creatorUser, withdrawalInput);
    mocks.getTransaction.mockResolvedValue({ data: { transaction: { state: "FAILED" } } });
    await processCreatorWithdrawal(row);
    await processCreatorWithdrawal(row);
    expect((await prisma.creatorProfile.findUniqueOrThrow({ where: { id: creatorId } })).availableBalanceUsdc.toString()).toBe("1.5");
  });
  it("keeps ambiguous transfer timeouts reserved instead of refunding or changing keys", async () => {
    const creatorUser = await fundCreator();
    const row = await withdrawalService.createWithdrawal(creatorUser, withdrawalInput);
    mocks.createTransaction.mockRejectedValue(new Error("timeout"));
    await processCreatorWithdrawal(row);
    expect((await prisma.creatorProfile.findUniqueOrThrow({ where: { id: creatorId } })).availableBalanceUsdc.toString()).toBe("0.5");
    expect((await prisma.creatorWithdrawal.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("PROCESSING");
    await prisma.creatorWithdrawal.update({ where: { id: row.id }, data: { updatedAt: new Date(Date.now() - 180_000) } });
    const retry = await prisma.creatorWithdrawal.findUniqueOrThrow({ where: { id: row.id } });
    mocks.createTransaction.mockResolvedValue({ data: { id: "recovered-transfer" } });
    await processCreatorWithdrawal(retry);
    expect(mocks.createTransaction.mock.calls[1][0]).toEqual(mocks.createTransaction.mock.calls[0][0]);
    expect((await prisma.creatorWithdrawal.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("COMPLETED");
  });
  it("Playground verifies key ownership, forwards the path and never sends session cookies upstream", async () => {
    const app = express(); app.use(express.json()); app.use(playgroundRouter); app.use(globalErrorHandler);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("No HTTP test port");
      const url = `http://127.0.0.1:${address.port}/playground`;
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Cookie: "privy-token=session-secret" }, body: JSON.stringify({ slug: "test-api", apiKey: secret, path: "/items/42" }) });
      expect(response.status).toBe(200);
      expect(mocks.transport.mock.calls[0][0].url).toBe("https://upstream.example.com/items/42");
      expect(mocks.transport.mock.calls[0][0].headers.cookie).toBeUndefined();
      mocks.session.userId = "another-user";
      const denied = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: "test-api", apiKey: secret }) });
      expect(denied.status).toBe(403);
    } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
  });
});
