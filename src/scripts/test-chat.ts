/**
 * DEV-ONLY test script — bypasses HTTP/auth entirely, calls the service directly.
 * Run: npx tsx src/scripts/test-chat.ts
 * Do NOT import this file anywhere in production code paths.
 */
import { prisma } from "../lib/prisma";
import { handleChatStream } from "../modules/agent/ai-router.service";

async function main() {
  // Pick any existing user, or create a throwaway one for local testing
  let user = await prisma.user.findFirst();
  if (!user) {
    user = await prisma.user.create({
      data: { privyUserId: `test-${Date.now()}` },
    });
    await prisma.balance.create({
      data: { userId: user.id, network: "TESTNET", amount: 100 },
    });
    console.log("Created test user + balance:", user.id);
  }

  const pricing = await prisma.modelPricing.findFirst({
    where: { effectiveTo: null, aiModel: { isActive: true } },
  });
  if (!pricing) throw new Error("No active ModelPricing found — seed one first");

  const result = await handleChatStream({
    userId: user.id,
    network: "TESTNET",
    modelPricingId: pricing.id,
    prompt: "hello, just testing",
  });

  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
