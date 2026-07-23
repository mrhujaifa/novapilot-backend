// import { describe, it, expect, beforeEach } from "vitest";
// import {
//   deductUsage,
//   creditDeposit,
//   InsufficientBalanceError,
//   DuplicateDepositError,
// } from "../backend/src/modules/billing/billing.service";
// import { prisma } from "../backend/src/lib/prisma";

// describe("billing.service", () => {
//   let userId: string;
//   let walletId: string;
//   let modelPricingId: string;
//   const network = "TESTNET" as const;

//   beforeEach(async () => {
//     const user = await prisma.user.create({ data: { privyUserId: `test-${Date.now()}` } });
//     userId = user.id;

//     const wallet = await prisma.wallet.create({
//       data: { userId, circleWalletId: `cw-${Date.now()}`, address: `0x${Date.now()}`, network },
//     });
//     walletId = wallet.id;

//     await prisma.balance.create({ data: { userId, network, amount: 10 } });

//     const provider = await prisma.aiProvider.upsert({
//       where: { name: "anthropic" },
//       update: {},
//       create: { name: "anthropic" },
//     });
//     const model = await prisma.aiModel.create({
//       data: { aiProviderId: provider.id, modelName: `test-${Date.now()}`, displayName: "Test" },
//     });
//     const pricing = await prisma.modelPricing.create({
//       data: { aiModelId: model.id, inputPricePerM: 3, outputPricePerM: 15 },
//     });
//     modelPricingId = pricing.id;
//   });

//   it("deducts correct cost", async () => {
//     const result = await deductUsage({
//       userId,
//       network,
//       modelPricingId,
//       inputTokens: 500_000,
//       outputTokens: 200_000,
//     });
//     expect(result.costUsdc).toBe("4.5");
//     expect(result.balanceAfter).toBe("5.5");
//   });

//   it("throws InsufficientBalanceError when balance too low", async () => {
//     await expect(
//       deductUsage({
//         userId,
//         network,
//         modelPricingId,
//         inputTokens: 2_000_000,
//         outputTokens: 1_000_000,
//       }),
//     ).rejects.toThrow(InsufficientBalanceError);
//   });

//   it("prevents over-draft on concurrent deductions", async () => {
//     const attempt = () =>
//       deductUsage({ userId, network, modelPricingId, inputTokens: 2_000_000, outputTokens: 0 }); // cost $6 each
//     const results = await Promise.allSettled([attempt(), attempt()]);
//     const succeeded = results.filter((r) => r.status === "fulfilled");
//     expect(succeeded.length).toBe(1);
//   });

//   it("credits deposit and updates balance", async () => {
//     const result = await creditDeposit({
//       userId,
//       walletId,
//       network,
//       txHash: `0xtx${Date.now()}`,
//       amount: "50",
//     });
//     expect(result.balanceAfter).toBe("60");
//   });

//   it("throws DuplicateDepositError on repeated txHash", async () => {
//     const txHash = `0xdup${Date.now()}`;
//     await creditDeposit({ userId, walletId, network, txHash, amount: "10" });
//     await expect(
//       creditDeposit({ userId, walletId, network, txHash, amount: "10" }),
//     ).rejects.toThrow(DuplicateDepositError);
//   });
// });
