/*
  Warnings:

  - A unique constraint covering the columns `[marketplaceUsageRecordId]` on the table `Transaction` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "ApiListingStatus" AS ENUM ('DRAFT', 'PENDING_PING', 'APPROVED', 'DEGRADED', 'SUSPENDED', 'BANNED');

-- CreateEnum
CREATE TYPE "ApiPricingModel" AS ENUM ('PER_1K_CALLS', 'PER_UNIT', 'SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "MarketplaceUsageStatus" AS ENUM ('RECEIVED', 'AUTHENTICATED', 'RESERVED', 'FORWARDED', 'COMPLETED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "LedgerAccountType" AS ENUM ('CONSUMER_LIABILITY', 'CREATOR_PAYABLE', 'PLATFORM_FEE_REVENUE', 'REFUND_LIABILITY', 'SETTLEMENT_PENDING', 'SETTLEMENT_COMPLETED');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "CircuitBreakerState" AS ENUM ('CLOSED', 'OPEN', 'HALF_OPEN');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'RISK_REVIEW', 'ACTIONED', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "CreatorEarningStatus" AS ENUM ('PENDING', 'AVAILABLE', 'FROZEN', 'SETTLEMENT_PENDING', 'SETTLED', 'REVERSED');

-- CreateEnum
CREATE TYPE "MarketplaceKeyStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TransactionType" ADD VALUE 'MARKETPLACE_CHARGE';
ALTER TYPE "TransactionType" ADD VALUE 'MARKETPLACE_REFUND';

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "marketplaceUsageRecordId" TEXT;

-- CreateTable
CREATE TABLE "ApiCredential" (
    "id" TEXT NOT NULL,
    "apiId" TEXT NOT NULL,
    "headerName" TEXT NOT NULL,
    "encryptedHeaderValue" TEXT NOT NULL,
    "kmsKeyId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotatedAt" TIMESTAMP(3),

    CONSTRAINT "ApiCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiHealthCheck" (
    "id" TEXT NOT NULL,
    "apiId" TEXT NOT NULL,
    "state" "CircuitBreakerState" NOT NULL DEFAULT 'CLOSED',
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextRetryAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiHealthCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiListing" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "apiName" TEXT NOT NULL,
    "apiSlug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "targetOriginUrl" TEXT NOT NULL,
    "proxyEndpointUrl" TEXT NOT NULL,
    "pricingModel" "ApiPricingModel" NOT NULL DEFAULT 'PER_1K_CALLS',
    "status" "ApiListingStatus" NOT NULL DEFAULT 'DRAFT',
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "successfulCalls" INTEGER NOT NULL DEFAULT 0,
    "uptimePercent" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "avgLatencyMs" INTEGER NOT NULL DEFAULT 0,
    "network" "NetworkEnv" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiPriceVersion" (
    "id" TEXT NOT NULL,
    "apiId" TEXT NOT NULL,
    "costPer1kCalls" DECIMAL(18,8) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveUntil" TIMESTAMP(3),
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiPriceVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiReport" (
    "id" TEXT NOT NULL,
    "apiId" TEXT NOT NULL,
    "reporterUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "apiId" TEXT NOT NULL,
    "priceVersionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreatorEarningSettlement" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "amountUsdc" DECIMAL(18,6) NOT NULL,
    "status" "CreatorEarningStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "circleTransferId" TEXT,
    "txHash" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreatorEarningSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreatorProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "availableCredits" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "pendingCredits" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "frozenCredits" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "totalCallsServed" INTEGER NOT NULL DEFAULT 0,
    "badgeEmailVerified" BOOLEAN NOT NULL DEFAULT false,
    "badgePingPassed" BOOLEAN NOT NULL DEFAULT false,
    "badge100Calls" BOOLEAN NOT NULL DEFAULT false,
    "badgeZeroReports" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreatorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceConsumerKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "apiId" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "status" "MarketplaceKeyStatus" NOT NULL DEFAULT 'ACTIVE',
    "rateLimitPerMinute" INTEGER,
    "spendingLimitUsdc" DECIMAL(18,6),
    "spentUsdc" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceConsumerKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceLedgerEntry" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "accountType" "LedgerAccountType" NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amountUsdc" DECIMAL(18,8) NOT NULL,
    "referenceId" TEXT NOT NULL,
    "referenceType" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "previousBalance" DECIMAL(18,6) NOT NULL,
    "resultingBalance" DECIMAL(18,6) NOT NULL,
    "reason" TEXT NOT NULL,
    "apiId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "marketplaceUsageRecordId" TEXT,

    CONSTRAINT "MarketplaceLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceUsageRecord" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "consumerKeyId" TEXT NOT NULL,
    "apiId" TEXT NOT NULL,
    "priceVersionId" TEXT NOT NULL,
    "status" "MarketplaceUsageStatus" NOT NULL DEFAULT 'RECEIVED',
    "reservedAmountUsdc" DECIMAL(18,8) NOT NULL,
    "finalChargeUsdc" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "latencyMs" INTEGER,
    "upstreamStatusCode" INTEGER,
    "requestId" TEXT NOT NULL,
    "network" "NetworkEnv" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceUsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiCredential_apiId_key" ON "ApiCredential"("apiId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiHealthCheck_apiId_key" ON "ApiHealthCheck"("apiId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiListing_apiSlug_key" ON "ApiListing"("apiSlug");

-- CreateIndex
CREATE INDEX "ApiListing_creatorId_idx" ON "ApiListing"("creatorId");

-- CreateIndex
CREATE INDEX "ApiListing_status_idx" ON "ApiListing"("status");

-- CreateIndex
CREATE INDEX "ApiListing_category_idx" ON "ApiListing"("category");

-- CreateIndex
CREATE INDEX "ApiListing_apiSlug_idx" ON "ApiListing"("apiSlug");

-- CreateIndex
CREATE INDEX "ApiPriceVersion_apiId_isCurrent_idx" ON "ApiPriceVersion"("apiId", "isCurrent");

-- CreateIndex
CREATE INDEX "ApiPriceVersion_apiId_effectiveFrom_idx" ON "ApiPriceVersion"("apiId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "ApiReport_apiId_idx" ON "ApiReport"("apiId");

-- CreateIndex
CREATE INDEX "ApiReport_status_idx" ON "ApiReport"("status");

-- CreateIndex
CREATE INDEX "ApiReport_reporterUserId_idx" ON "ApiReport"("reporterUserId");

-- CreateIndex
CREATE INDEX "ApiSubscription_userId_idx" ON "ApiSubscription"("userId");

-- CreateIndex
CREATE INDEX "ApiSubscription_apiId_idx" ON "ApiSubscription"("apiId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiSubscription_userId_apiId_key" ON "ApiSubscription"("userId", "apiId");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorEarningSettlement_idempotencyKey_key" ON "CreatorEarningSettlement"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CreatorEarningSettlement_creatorId_idx" ON "CreatorEarningSettlement"("creatorId");

-- CreateIndex
CREATE INDEX "CreatorEarningSettlement_status_idx" ON "CreatorEarningSettlement"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorProfile_userId_key" ON "CreatorProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceConsumerKey_keyHash_key" ON "MarketplaceConsumerKey"("keyHash");

-- CreateIndex
CREATE INDEX "MarketplaceConsumerKey_userId_idx" ON "MarketplaceConsumerKey"("userId");

-- CreateIndex
CREATE INDEX "MarketplaceConsumerKey_apiId_idx" ON "MarketplaceConsumerKey"("apiId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceLedgerEntry_idempotencyKey_key" ON "MarketplaceLedgerEntry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "MarketplaceLedgerEntry_referenceId_idx" ON "MarketplaceLedgerEntry"("referenceId");

-- CreateIndex
CREATE INDEX "MarketplaceLedgerEntry_accountType_idx" ON "MarketplaceLedgerEntry"("accountType");

-- CreateIndex
CREATE INDEX "MarketplaceLedgerEntry_createdAt_idx" ON "MarketplaceLedgerEntry"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceUsageRecord_idempotencyKey_key" ON "MarketplaceUsageRecord"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceUsageRecord_requestId_key" ON "MarketplaceUsageRecord"("requestId");

-- CreateIndex
CREATE INDEX "MarketplaceUsageRecord_consumerKeyId_idx" ON "MarketplaceUsageRecord"("consumerKeyId");

-- CreateIndex
CREATE INDEX "MarketplaceUsageRecord_apiId_idx" ON "MarketplaceUsageRecord"("apiId");

-- CreateIndex
CREATE INDEX "MarketplaceUsageRecord_createdAt_idx" ON "MarketplaceUsageRecord"("createdAt");

-- CreateIndex
CREATE INDEX "MarketplaceUsageRecord_status_idx" ON "MarketplaceUsageRecord"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_marketplaceUsageRecordId_key" ON "Transaction"("marketplaceUsageRecordId");

-- AddForeignKey
ALTER TABLE "ApiCredential" ADD CONSTRAINT "ApiCredential_apiId_fkey" FOREIGN KEY ("apiId") REFERENCES "ApiListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiHealthCheck" ADD CONSTRAINT "ApiHealthCheck_apiId_fkey" FOREIGN KEY ("apiId") REFERENCES "ApiListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiListing" ADD CONSTRAINT "ApiListing_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "CreatorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiPriceVersion" ADD CONSTRAINT "ApiPriceVersion_apiId_fkey" FOREIGN KEY ("apiId") REFERENCES "ApiListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiReport" ADD CONSTRAINT "ApiReport_apiId_fkey" FOREIGN KEY ("apiId") REFERENCES "ApiListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiReport" ADD CONSTRAINT "ApiReport_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiSubscription" ADD CONSTRAINT "ApiSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiSubscription" ADD CONSTRAINT "ApiSubscription_apiId_fkey" FOREIGN KEY ("apiId") REFERENCES "ApiListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorEarningSettlement" ADD CONSTRAINT "CreatorEarningSettlement_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "CreatorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorProfile" ADD CONSTRAINT "CreatorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceConsumerKey" ADD CONSTRAINT "MarketplaceConsumerKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceConsumerKey" ADD CONSTRAINT "MarketplaceConsumerKey_apiId_fkey" FOREIGN KEY ("apiId") REFERENCES "ApiListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceLedgerEntry" ADD CONSTRAINT "MarketplaceLedgerEntry_apiId_fkey" FOREIGN KEY ("apiId") REFERENCES "ApiListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceLedgerEntry" ADD CONSTRAINT "MarketplaceLedgerEntry_marketplaceUsageRecordId_fkey" FOREIGN KEY ("marketplaceUsageRecordId") REFERENCES "MarketplaceUsageRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceUsageRecord" ADD CONSTRAINT "MarketplaceUsageRecord_consumerKeyId_fkey" FOREIGN KEY ("consumerKeyId") REFERENCES "MarketplaceConsumerKey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceUsageRecord" ADD CONSTRAINT "MarketplaceUsageRecord_apiId_fkey" FOREIGN KEY ("apiId") REFERENCES "ApiListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceUsageRecord" ADD CONSTRAINT "MarketplaceUsageRecord_priceVersionId_fkey" FOREIGN KEY ("priceVersionId") REFERENCES "ApiPriceVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_marketplaceUsageRecordId_fkey" FOREIGN KEY ("marketplaceUsageRecordId") REFERENCES "MarketplaceUsageRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
