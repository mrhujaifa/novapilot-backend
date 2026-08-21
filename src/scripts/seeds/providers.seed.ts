import { prisma } from "../../lib/prisma";

export async function seedProviders() {
  const providers = ["Google", "Anthropic", "OpenAI", "xAI", "DeepSeek"];

  for (const name of providers) {
    await prisma.aiProvider.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  console.log("✅ AI Providers seeded");
}
