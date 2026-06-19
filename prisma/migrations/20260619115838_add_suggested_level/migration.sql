-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "suggestedLevel" "OrgBadgeLevel";

-- CreateIndex
CREATE INDEX "Organization_suggestedLevel_idx" ON "Organization"("suggestedLevel");
