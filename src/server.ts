import { app } from "./index";
import { env } from "./config/env.config";
import { logger } from "./lib/logger";
import { connectRedis } from "./lib/redis";
import { prisma } from "./lib/prisma";

async function bootstrap() {
  await connectRedis();

  app.listen(env.PORT, () => {
    logger.info(`🚀 Server listening on port ${env.PORT}`);
  });

  // Add this to your src/server.ts after app.listen()
  // This is what Meta/Google/Vercel do — active requests finish before process exits.

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "Server started");
  });

  // Graceful shutdown — handle SIGTERM (sent by Fly.io/Docker on deploy/scale-down)
  // and SIGINT (Ctrl+C in local dev).
  const shutdown = (signal: string) => {
    logger.info(
      { signal },
      "Shutdown signal received, closing server gracefully",
    );

    // Stop accepting new connections immediately.
    server.close(() => {
      logger.info("All connections closed — process exiting");
      // Disconnect Prisma so DB connection pool is released cleanly.
      prisma.$disconnect().finally(() => process.exit(0));
    });

    // Force exit if graceful shutdown takes too long (e.g. stuck streaming request).
    // Fly.io waits 30s before SIGKILL — we exit before that.
    setTimeout(() => {
      logger.error("Graceful shutdown timeout — forcing exit");
      process.exit(1);
    }, 25_000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

if (process.env.NODE_ENV !== "test") {
  bootstrap().catch((error) => {
    logger.error({ err: error }, "Server bootstrap failed");
    process.exit(1);
  });
}
