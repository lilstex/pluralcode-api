-- CreateTable
CREATE TABLE "ResourceView" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResourceView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceCompletion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "pointsEarned" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResourceCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResourceView_userId_idx" ON "ResourceView"("userId");

-- CreateIndex
CREATE INDEX "ResourceView_resourceId_idx" ON "ResourceView"("resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceView_userId_resourceId_key" ON "ResourceView"("userId", "resourceId");

-- CreateIndex
CREATE INDEX "ResourceCompletion_userId_idx" ON "ResourceCompletion"("userId");

-- CreateIndex
CREATE INDEX "ResourceCompletion_resourceId_idx" ON "ResourceCompletion"("resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceCompletion_userId_resourceId_key" ON "ResourceCompletion"("userId", "resourceId");

-- AddForeignKey
ALTER TABLE "ResourceView" ADD CONSTRAINT "ResourceView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceView" ADD CONSTRAINT "ResourceView_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceCompletion" ADD CONSTRAINT "ResourceCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceCompletion" ADD CONSTRAINT "ResourceCompletion_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
