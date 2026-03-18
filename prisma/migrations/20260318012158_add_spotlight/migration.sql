-- CreateEnum
CREATE TYPE "SpotlightMode" AS ENUM ('AUTO', 'MANUAL');

-- CreateTable
CREATE TABLE "SpotlightSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "defaultPeriodDays" INTEGER NOT NULL DEFAULT 2,
    "mode" "SpotlightMode" NOT NULL DEFAULT 'AUTO',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpotlightSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpotlightEntry" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "wasAuto" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpotlightEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpotlightHistory" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "wasAuto" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpotlightHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SpotlightEntry_isActive_idx" ON "SpotlightEntry"("isActive");

-- CreateIndex
CREATE INDEX "SpotlightEntry_startAt_idx" ON "SpotlightEntry"("startAt");

-- CreateIndex
CREATE INDEX "SpotlightEntry_endAt_idx" ON "SpotlightEntry"("endAt");

-- CreateIndex
CREATE INDEX "SpotlightHistory_orgId_idx" ON "SpotlightHistory"("orgId");

-- CreateIndex
CREATE INDEX "SpotlightHistory_startAt_idx" ON "SpotlightHistory"("startAt");

-- AddForeignKey
ALTER TABLE "SpotlightEntry" ADD CONSTRAINT "SpotlightEntry_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpotlightHistory" ADD CONSTRAINT "SpotlightHistory_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
