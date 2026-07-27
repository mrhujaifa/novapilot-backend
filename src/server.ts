import { app } from "./index";
import { env } from "./config/env.config";
import { logger } from "./lib/logger";
import { connectRedis } from "./lib/redis";

async function bootstrap() {
  await connectRedis();

  app.listen(env.PORT, () => {
    logger.info(`🚀 Server listening on port ${env.PORT}`);
  });
}

if (process.env.NODE_ENV !== "test") {
  bootstrap().catch((error) => {
    logger.error({ err: error }, "Server bootstrap failed");
    process.exit(1);
  });
}
