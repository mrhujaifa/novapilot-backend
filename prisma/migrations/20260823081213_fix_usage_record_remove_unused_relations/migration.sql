-- DropForeignKey
ALTER TABLE "MarketplaceLedgerEntry" DROP CONSTRAINT "MarketplaceLedgerEntry_marketplaceUsageRecordId_fkey";

-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_marketplaceUsageRecordId_fkey";
