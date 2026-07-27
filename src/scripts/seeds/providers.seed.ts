import { prisma } from "../../lib/prisma";

export async function seedProviders() {
  const providers = [
    // "OpenAI",
    // "Anthropic",
    // "Google",
    // "DeepSeek",
    // "xAI",
    // "Mistral",
    // "Meta",
    // "Qwen",
    "OpenRouter",
  ];

  for (const name of providers) {
    await prisma.aiProvider.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  console.log("✅ AI Providers seeded");
}
