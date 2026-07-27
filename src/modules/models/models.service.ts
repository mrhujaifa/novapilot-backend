import { prisma } from "../../lib/prisma";

interface ActiveModel {
  modelPricingId: string;
  provider: string;
  modelName: string;
  displayName: string;
  inputPricePerM: string;
  outputPricePerM: string;
}

export async function getActiveModels(): Promise<ActiveModel[]> {
  const modelsWithPricing = await prisma.aiModel.findMany({
    where: {
      isActive: true,
      pricingHistory: {
        some: {
          effectiveTo: null,
        },
      },
    },
    include: {
      aiProvider: true,
      pricingHistory: {
        where: {
          effectiveTo: null,
        },
      },
    },
  });

  return modelsWithPricing
    .filter((m) => m.pricingHistory.length > 0)
    .map((m) => ({
      modelPricingId: m.pricingHistory[0].id,
      provider: m.aiProvider.name,
      modelName: m.modelName,
      displayName: m.displayName,
      inputPricePerM: m.pricingHistory[0].inputPricePerM.toString(),
      outputPricePerM: m.pricingHistory[0].outputPricePerM.toString(),
    }));
}
