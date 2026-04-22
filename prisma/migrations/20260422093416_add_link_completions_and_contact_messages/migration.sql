-- CreateEnum
CREATE TYPE "ContactMessageStatus" AS ENUM ('UNREAD', 'READ', 'REPLIED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "ResourceLinkCompletion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resourceLinkId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResourceLinkCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactMessage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "ContactMessageStatus" NOT NULL DEFAULT 'UNREAD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResourceLinkCompletion_userId_idx" ON "ResourceLinkCompletion"("userId");

-- CreateIndex
CREATE INDEX "ResourceLinkCompletion_resourceLinkId_idx" ON "ResourceLinkCompletion"("resourceLinkId");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceLinkCompletion_userId_resourceLinkId_key" ON "ResourceLinkCompletion"("userId", "resourceLinkId");

-- CreateIndex
CREATE INDEX "ContactMessage_status_idx" ON "ContactMessage"("status");

-- CreateIndex
CREATE INDEX "ContactMessage_createdAt_idx" ON "ContactMessage"("createdAt");

-- AddForeignKey
ALTER TABLE "ResourceLinkCompletion" ADD CONSTRAINT "ResourceLinkCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceLinkCompletion" ADD CONSTRAINT "ResourceLinkCompletion_resourceLinkId_fkey" FOREIGN KEY ("resourceLinkId") REFERENCES "ResourceLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
