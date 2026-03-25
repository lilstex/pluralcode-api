-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ACCOUNT_APPROVED', 'ACCOUNT_REJECTED', 'EVENT_REGISTRATION_CONFIRMED', 'EVENT_UPDATED', 'EVENT_CANCELLED', 'EVENT_REMINDER', 'MENTOR_REQUEST_RECEIVED', 'MENTOR_REQUEST_APPROVED', 'MENTOR_REQUEST_DECLINED', 'MENTOR_SESSION_COMPLETED', 'COMMUNITY_TOPIC_COMMENT', 'COMMUNITY_MENTION', 'COMMUNITY_TOPIC_LIKED', 'RESOURCE_COMPLETED', 'ACHIEVEMENT_EARNED', 'ODA_ASSESSMENT_COMPLETED', 'SYSTEM_ANNOUNCEMENT');

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "meta" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_type_idx" ON "Notification"("type");

-- CreateIndex
CREATE INDEX "Notification_isRead_idx" ON "Notification"("isRead");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
