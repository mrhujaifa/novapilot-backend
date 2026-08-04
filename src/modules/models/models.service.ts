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
    .map((m) => {
      const pricing = m.pricingHistory[0];
      if (!pricing) return null;

      return {
        modelPricingId: pricing.id,
        provider: m.aiProvider.name,
        modelName: m.modelName,
        displayName: m.displayName,
        inputPricePerM: pricing.inputPricePerM.toString(),
        outputPricePerM: pricing.outputPricePerM.toString(),
      };
    })
    .filter((m): m is ActiveModel => m !== null);
}
