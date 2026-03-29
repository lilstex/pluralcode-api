-- AlterTable
ALTER TABLE "CommunityTopic" ADD COLUMN     "viewCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "CommunityMention_communityId_idx" ON "CommunityMention"("communityId");

-- CreateIndex
CREATE INDEX "CommunityTopic_viewCount_idx" ON "CommunityTopic"("viewCount");
