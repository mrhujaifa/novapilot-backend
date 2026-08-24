/*
  Warnings:

  - You are about to drop the column `encryptedHeaderValue` on the `ApiCredential` table. All the data in the column will be lost.
  - You are about to drop the column `headerName` on the `ApiCredential` table. All the data in the column will be lost.
  - You are about to drop the column `targetOriginUrl` on the `ApiListing` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[apiId,name]` on the table `ApiCredential` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `encryptedData` to the `ApiCredential` table without a default value. This is not possible if the table is not empty.
  - Added the required column `targetBaseUrl` to the `ApiListing` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "CredentialType" AS ENUM ('API_KEY', 'BEARER', 'BASIC', 'CUSTOM');

-- DropForeignKey
ALTER TABLE "MarketplaceLedgerEntry" DROP CONSTRAINT "MarketplaceLedgerEntry_apiId_fkey";

-- DropIndex
DROP INDEX "ApiCredential_apiId_key";

-- AlterTable
ALTER TABLE "ApiCredential" DROP COLUMN "encryptedHeaderValue",
DROP COLUMN "headerName",
ADD COLUMN     "encryptedData" TEXT NOT NULL,
ADD COLUMN     "name" TEXT NOT NULL DEFAULT 'primary',
ADD COLUMN     "type" "CredentialType" NOT NULL DEFAULT 'API_KEY';

-- AlterTable
ALTER TABLE "ApiListing" DROP COLUMN "targetOriginUrl",
ADD COLUMN     "authSpec" JSONB,
ADD COLUMN     "requestSpec" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "targetBaseUrl" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "ApiCredential_apiId_idx" ON "ApiCredential"("apiId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiCredential_apiId_name_key" ON "ApiCredential"("apiId", "name");
