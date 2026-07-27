import { prisma } from "../../lib/prisma";

export async function seedModels() {
  const providers = await prisma.aiProvider.findMany();

  const providerMap = Object.fromEntries(providers.map((p) => [p.name, p.id]));

  const models = [
    // ================= Google =================
    {
      provider: "Google",
      modelName: "gemini-2.5-flash-preview",
      displayName: "Gemini 2.5 Flash Preview",
    },
    {
      provider: "Google",
      modelName: "gemini-2.5-flash",
      displayName: "Gemini 2.5 Flash",
    },
    {
      provider: "Google",
      modelName: "gemini-2.5-flash-lite",
      displayName: "Gemini 2.5 Flash Lite",
    },

    // ================= Anthropic =================
    {
      provider: "Anthropic",
      modelName: "claude-opus-5",
      displayName: "Claude Opus 5",
    },
    {
      provider: "Anthropic",
      modelName: "claude-sonnet-5",
      displayName: "Claude Sonnet 5",
    },
    {
      provider: "Anthropic",
      modelName: "claude-haiku-4-5-20251001",
      displayName: "Claude Haiku 4.5",
    },
    // ================= OpenAI =================
    {
      provider: "OpenAI",
      modelName: "gpt-5",
      displayName: "GPT-5",
    },
    {
      provider: "OpenAI",
      modelName: "gpt-5-mini",
      displayName: "GPT-5 Mini",
    },
    {
      provider: "OpenAI",
      modelName: "o3",
      displayName: "OpenAI o3",
    },

    // ================= xAI =================
    {
      provider: "xAI",
      modelName: "grok-4",
      displayName: "Grok 4",
    },

    // ================= DeepSeek =================
    {
      provider: "DeepSeek",
      modelName: "deepseek-chat",
      displayName: "DeepSeek Chat",
    },
    {
      provider: "DeepSeek",
      modelName: "deepseek-reasoner",
      displayName: "DeepSeek Reasoner",
    },

    {
      provider: "OpenRouter",
      modelName: "meta-llama/llama-3.3-8b-instruct:free",
      displayName: "Llama 3.3 8B (Free)",
    },
    {
      provider: "OpenRouter",
      modelName: "mistralai/mistral-7b-instruct:free",
      displayName: "Mistral 7B (Free)",
    },
    {
      provider: "OpenRouter",
      modelName: "google/gemma-3-4b-it:free",
      displayName: "Gemma 3 4B (Free)",
    },
  ];

  for (const model of models) {
    await prisma.aiModel.upsert({
      where: {
        aiProviderId_modelName: {
          aiProviderId: providerMap[model.provider],
          modelName: model.modelName,
        },
      },
      update: {
        displayName: model.displayName,
        isActive: true,
      },
      create: {
        aiProviderId: providerMap[model.provider],
        modelName: model.modelName,
        displayName: model.displayName,
      },
    });
  }

  console.log("✅ AI Models seeded");
}
