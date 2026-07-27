// src/modules/billing/sweep.service.ts

import type { TokenBlockchain } from "@circle-fin/developer-controlled-wallets";
import { v4 as uuidv4 } from "uuid";
import { Decimal } from "../../generated/prisma/internal/prismaNamespace";
import { prisma } from "../../lib/prisma";
import { logger } from "../../lib/logger";
import { circleClient } from "../../lib/circle";
import { env } from "../../config/env.config";
import type { NetworkEnv } from "../../generated/prisma/enums";

const BLOCKCHAIN_ID: Record<NetworkEnv, TokenBlockchain> = {
  TESTNET: "ARC-TESTNET",
  MAINNET: "ARC",
};

export interface TriggerSweepInput {
  userId: string;
  network: NetworkEnv;
  amountUsdc: string;
}

/**
 * Initiates a USDC transfer from the user's Circle wallet to the admin wallet.
 * Fire-and-forget — never throws. Billing already succeeded before this is called.
 * PENDING/FAILED settlements are retried by the reconciliation job.
 */
export async function triggerSweep(input: TriggerSweepInput): Promise<void> {
  const { userId, network, amountUsdc } = input;

  try {
    const wallet = await prisma.wallet.findUniqueOrThrow({
      where: { userId_network: { userId, network } },
    });

    const idempotencyKey = uuidv4();

    const settlement = await prisma.settlement.create({
      data: {
        userId,
        network,
        fromWalletId: wallet.circleWalletId,
        toWalletId: env.ADMIN_CIRCLE_WALLET_ID,
        amountUsdc: new Decimal(amountUsdc),
        status: "PENDING",
        idempotencyKey,
      },
    });

    await prisma.settlement.update({
      where: { id: settlement.id },
      data: { status: "PROCESSING" },
    });

    const roundedAmount = new Decimal(amountUsdc).toDecimalPlaces(6).toString();

    const transferResponse = await circleClient.createTransaction({
      blockchain: BLOCKCHAIN_ID[network],
      walletAddress: wallet.address,
      tokenAddress: env.USDC_CONTRACT_ADDRESS,
      destinationAddress: env.ADMIN_CIRCLE_WALLET_ADDRESS,
      amount: [roundedAmount], // ← amountUsdc এর বদলে
      fee: {
        type: "level",
        config: { feeLevel: "MEDIUM" },
      },
    });

    const circleTransferId = transferResponse.data?.id;

    if (!circleTransferId) {
      throw new Error("Circle createTransaction returned no ID");
    }

    await prisma.settlement.update({
      where: { id: settlement.id },
      data: { circleTransferId },
    });

    logger.info(
      { userId, network, settlementId: settlement.id, circleTransferId, amountUsdc },
      "Sweep initiated",
    );
  } catch (err) {
    logger.error({ userId, network, amountUsdc, err }, "Sweep initiation failed");
  }
}
