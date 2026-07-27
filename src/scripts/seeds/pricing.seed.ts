import { prisma } from "../../lib/prisma";

export async function seedModelPricing() {
  const models = await prisma.aiModel.findMany();

  const pricing: Record<
    string,
    {
      inputPricePerM: number;
      outputPricePerM: number;
    }
  > = {
    "meta-llama/llama-3.3-8b-instruct:free": {
      inputPricePerM: 0.5,
      outputPricePerM: 1.5,
    },
    "mistralai/mistral-7b-instruct:free": {
      inputPricePerM: 0.3,
      outputPricePerM: 1.0,
    },
    "google/gemma-3-4b-it:free": {
      inputPricePerM: 0.2,
      outputPricePerM: 0.8,
    },
  };
  // > = {
  //   // ================= OpenAI =================
  //   "gpt-5": {
  //     inputPricePerM: 1.25,
  //     outputPricePerM: 10,
  //   },
  //   "gpt-5-mini": {
  //     inputPricePerM: 0.25,
  //     outputPricePerM: 2,
  //   },
  //   o3: {
  //     inputPricePerM: 2,
  //     outputPricePerM: 8,
  //   },

  //   // ================= Anthropic =================
  //   "claude-opus-5": {
  //     inputPricePerM: 15,
  //     outputPricePerM: 75,
  //   },
  //   "claude-sonnet-5": {
  //     inputPricePerM: 3,
  //     outputPricePerM: 15,
  //   },
  //   "claude-haiku-4-5-20251001": {
  //     inputPricePerM: 1,
  //     outputPricePerM: 5,
  //   },

  //   // ================= Google =================
  //   "gemini-2.5-pro": {
  //     inputPricePerM: 1.25,
  //     outputPricePerM: 10,
  //   },
  //   "gemini-2.5-flash": {
  //     inputPricePerM: 0.3,
  //     outputPricePerM: 2.5,
  //   },

  //   // ================= xAI =================
  //   "grok-4": {
  //     inputPricePerM: 3,
  //     outputPricePerM: 15,
  //   },

  //   // ================= DeepSeek =================
  //   "deepseek-chat": {
  //     inputPricePerM: 0.27,
  //     outputPricePerM: 1.1,
  //   },
  //   "deepseek-reasoner": {
  //     inputPricePerM: 0.55,
  //     outputPricePerM: 2.19,
  //   },
  // };

  for (const model of models) {
    const modelPricing = pricing[model.modelName];

    if (!modelPricing) {
      console.log(`⚠️ Pricing missing for ${model.modelName}`);
      continue;
    }

    const existing = await prisma.modelPricing.findFirst({
      where: {
        aiModelId: model.id,
        effectiveTo: null,
      },
    });

    if (existing) {
      await prisma.modelPricing.update({
        where: {
          id: existing.id,
        },
        data: {
          inputPricePerM: modelPricing.inputPricePerM,
          outputPricePerM: modelPricing.outputPricePerM,
        },
      });

      continue;
    }

    await prisma.modelPricing.create({
      data: {
        aiModelId: model.id,
        inputPricePerM: modelPricing.inputPricePerM,
        outputPricePerM: modelPricing.outputPricePerM,
        effectiveTo: null,
      },
    });
  }

  console.log("✅ Model Pricing seeded");
}
