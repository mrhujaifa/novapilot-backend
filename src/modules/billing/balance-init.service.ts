import { prisma } from "../../lib/prisma";
import { logger } from "../../lib/logger";
import { NetworkEnv } from "../../generated/prisma";

/**
 * Creates a zero-balance row for a user on a given network.
 * Must be called right after a Circle wallet is created for that network,
 * otherwise deductUsage/creditDeposit will fail with "Balance not found".
 * Idempotent — safe to call even if a balance row already exists.
 */
export async function initializeBalance(
  userId: string,
  network: NetworkEnv,
): Promise<void> {
  await prisma.balance.upsert({
    where: { userId_network: { userId, network } },
    update: {},
    create: { userId, network, amount: 0 },
  });

  logger.info({ userId, network }, "Balance initialized");
}
