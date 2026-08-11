/*
  Warnings:

  - A unique constraint covering the columns `[sourceTxHash]` on the table `Deposit` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "DepositMethod" AS ENUM ('DIRECT', 'CCTP');

-- AlterTable
ALTER TABLE "Deposit" ADD COLUMN     "attestation" TEXT,
ADD COLUMN     "depositMethod" "DepositMethod" NOT NULL DEFAULT 'DIRECT',
ADD COLUMN     "messageHash" TEXT,
ADD COLUMN     "sourceChain" TEXT,
ADD COLUMN     "sourceTxHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Deposit_sourceTxHash_key" ON "Deposit"("sourceTxHash");

-- CreateIndex
CREATE INDEX "Deposit_messageHash_idx" ON "Deposit"("messageHash");
