/*
  Warnings:

  - You are about to drop the column `availableCredits` on the `CreatorProfile` table. All the data in the column will be lost.
  - You are about to drop the column `badge100Calls` on the `CreatorProfile` table. All the data in the column will be lost.
  - You are about to drop the column `badgeEmailVerified` on the `CreatorProfile` table. All the data in the column will be lost.
  - You are about to drop the column `badgePingPassed` on the `CreatorProfile` table. All the data in the column will be lost.
  - You are about to drop the column `badgeZeroReports` on the `CreatorProfile` table. All the data in the column will be lost.
  - You are about to drop the column `frozenCredits` on the `CreatorProfile` table. All the data in the column will be lost.
  - You are about to drop the column `pendingCredits` on the `CreatorProfile` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "CreatorProfile" DROP COLUMN "availableCredits",
DROP COLUMN "badge100Calls",
DROP COLUMN "badgeEmailVerified",
DROP COLUMN "badgePingPassed",
DROP COLUMN "badgeZeroReports",
DROP COLUMN "frozenCredits",
DROP COLUMN "pendingCredits",
ADD COLUMN     "availableBalanceUsdc" DECIMAL(18,6) NOT NULL DEFAULT 0,
ADD COLUMN     "bio" TEXT,
ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "frozenBalanceUsdc" DECIMAL(18,6) NOT NULL DEFAULT 0,
ADD COLUMN     "pendingBalanceUsdc" DECIMAL(18,6) NOT NULL DEFAULT 0,
ADD COLUMN     "website" TEXT;

-- CreateTable
CREATE TABLE "CreatorWithdrawal" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "amountUsdc" DECIMAL(18,6) NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "circleTransferId" TEXT,
    "txHash" TEXT,
    "destinationAddress" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreatorWithdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreatorWithdrawal_idempotencyKey_key" ON "CreatorWithdrawal"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CreatorWithdrawal_creatorId_idx" ON "CreatorWithdrawal"("creatorId");

-- CreateIndex
CREATE INDEX "CreatorWithdrawal_status_idx" ON "CreatorWithdrawal"("status");

-- AddForeignKey
ALTER TABLE "CreatorWithdrawal" ADD CONSTRAINT "CreatorWithdrawal_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "CreatorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
