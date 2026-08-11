/*
  Warnings:

  - You are about to drop the column `attestation` on the `Deposit` table. All the data in the column will be lost.
  - You are about to drop the column `messageHash` on the `Deposit` table. All the data in the column will be lost.
  - You are about to drop the column `sourceTxHash` on the `Deposit` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Deposit_messageHash_idx";

-- DropIndex
DROP INDEX "Deposit_sourceTxHash_key";

-- AlterTable
ALTER TABLE "Deposit" DROP COLUMN "attestation",
DROP COLUMN "messageHash",
DROP COLUMN "sourceTxHash";
