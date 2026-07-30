import { NetworkEnv } from "../../generated/prisma";

export interface GetUsageSummaryInput {
  userId: string;
  network: NetworkEnv;
}

export interface UsageSummaryResult {
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsdc: string;
}
