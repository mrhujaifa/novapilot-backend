ALTER TABLE "CreatorEarningSettlement"
ADD COLUMN "usageRecordId" TEXT,
ADD COLUMN "network" "NetworkEnv";
CREATE UNIQUE INDEX "CreatorEarningSettlement_usageRecordId_key" ON "CreatorEarningSettlement"("usageRecordId");
ALTER TABLE "CreatorWithdrawal" ADD COLUMN "network" "NetworkEnv";
