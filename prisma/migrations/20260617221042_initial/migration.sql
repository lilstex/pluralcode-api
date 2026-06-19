-- CreateEnum
CREATE TYPE "OrgBadgeLevel" AS ENUM ('LEVEL_1', 'LEVEL_2', 'LEVEL_3');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "badgeLevel" "OrgBadgeLevel",
ADD COLUMN     "badgeLevelAssignedAt" TIMESTAMP(3),
ADD COLUMN     "badgeLevelAssignedById" TEXT,
ADD COLUMN     "dismissedSuggestionLevel" INTEGER;

-- CreateTable
CREATE TABLE "OrganizationBadgeHistory" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "level" "OrgBadgeLevel",
    "assignedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationBadgeHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrganizationBadgeHistory_orgId_idx" ON "OrganizationBadgeHistory"("orgId");

-- CreateIndex
CREATE INDEX "OrganizationBadgeHistory_level_idx" ON "OrganizationBadgeHistory"("level");

-- AddForeignKey
ALTER TABLE "OrganizationBadgeHistory" ADD CONSTRAINT "OrganizationBadgeHistory_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
