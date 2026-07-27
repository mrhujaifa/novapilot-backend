import { prisma } from "../lib/prisma";

async function main() {
  const provider = await prisma.aiProvider.upsert({
    where: { name: "openrouter" },
    update: {},
    create: { name: "openrouter" },
  });

  const model = await prisma.aiModel.upsert({
    where: {
      aiProviderId_modelName: {
        aiProviderId: provider.id,
        modelName: "meta-llama/llama-3.3-70b-instruct:free",
      },
    },
    update: {},
    create: {
      aiProviderId: provider.id,
      modelName: "meta-llama/llama-3.3-70b-instruct:free",
      displayName: "Llama 3.3 70B (Free)",
      isActive: true,
    },
  });

  const existingPricing = await prisma.modelPricing.findFirst({
    where: { aiModelId: model.id, effectiveTo: null },
  });

  if (!existingPricing) {
    await prisma.modelPricing.create({
      data: {
        aiModelId: model.id,
        inputPricePerM: 0,
        outputPricePerM: 0,
      },
    });
  }

  console.log("Seeded provider/model/pricing:", { providerId: provider.id, modelId: model.id });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
