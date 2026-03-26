-- DropForeignKey
ALTER TABLE "CommunityMention" DROP CONSTRAINT "CommunityMention_communityId_fkey";

-- AlterTable
ALTER TABLE "CommunityMention" ALTER COLUMN "communityId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "CommunityMention" ADD CONSTRAINT "CommunityMention_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;
