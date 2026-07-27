import { prisma } from "../../lib/prisma";
import { seedModels } from "./models.seed";
import { seedModelPricing } from "./pricing.seed";
import { seedProviders } from "./providers.seed";

async function main() {
  await seedProviders();
  await seedModels();
  await seedModelPricing();
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("🌱 Seed completed");
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
