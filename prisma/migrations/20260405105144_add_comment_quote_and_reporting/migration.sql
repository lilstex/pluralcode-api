-- AlterTable
ALTER TABLE "CommunityComment" ADD COLUMN     "isBlocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isQuote" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "quoteId" TEXT;

-- CreateTable
CREATE TABLE "CommunityCommentReport" (
    "id" TEXT NOT NULL,
    "reason" TEXT,
    "reportedById" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityCommentReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommunityCommentReport_commentId_idx" ON "CommunityCommentReport"("commentId");

-- CreateIndex
CREATE INDEX "CommunityCommentReport_reportedById_idx" ON "CommunityCommentReport"("reportedById");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityCommentReport_commentId_reportedById_key" ON "CommunityCommentReport"("commentId", "reportedById");

-- CreateIndex
CREATE INDEX "CommunityComment_isBlocked_idx" ON "CommunityComment"("isBlocked");

-- CreateIndex
CREATE INDEX "CommunityComment_quoteId_idx" ON "CommunityComment"("quoteId");

-- AddForeignKey
ALTER TABLE "CommunityComment" ADD CONSTRAINT "CommunityComment_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "CommunityComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityCommentReport" ADD CONSTRAINT "CommunityCommentReport_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityCommentReport" ADD CONSTRAINT "CommunityCommentReport_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "CommunityComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
