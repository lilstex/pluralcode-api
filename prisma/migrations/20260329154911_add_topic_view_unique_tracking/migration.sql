-- CreateTable
CREATE TABLE "TopicView" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopicView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TopicView_userId_idx" ON "TopicView"("userId");

-- CreateIndex
CREATE INDEX "TopicView_topicId_idx" ON "TopicView"("topicId");

-- CreateIndex
CREATE UNIQUE INDEX "TopicView_userId_topicId_key" ON "TopicView"("userId", "topicId");

-- AddForeignKey
ALTER TABLE "TopicView" ADD CONSTRAINT "TopicView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicView" ADD CONSTRAINT "TopicView_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "CommunityTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
