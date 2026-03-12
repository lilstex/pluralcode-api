/*
  Warnings:

  - You are about to drop the `ODAForm` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "ODABlockStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED');

-- DropForeignKey
ALTER TABLE "ODAForm" DROP CONSTRAINT "ODAForm_orgId_fkey";

-- DropTable
DROP TABLE "ODAForm";

-- CreateTable
CREATE TABLE "ODAPillar" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ODAPillar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ODABuildingBlock" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "maxScore" INTEGER NOT NULL DEFAULT 100,
    "pillarId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ODABuildingBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ODAQuestion" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "buildingBlockId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ODAQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ODAAssessment" (
    "id" TEXT NOT NULL,
    "status" "FormStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "overallScore" DOUBLE PRECISION,
    "aiSummary" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "orgId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ODAAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ODABlockResponse" (
    "id" TEXT NOT NULL,
    "status" "ODABlockStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "blockScore" DOUBLE PRECISION,
    "answers" JSONB NOT NULL DEFAULT '[]',
    "assessmentId" TEXT NOT NULL,
    "buildingBlockId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ODABlockResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ODAPillar_name_key" ON "ODAPillar"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ODABuildingBlock_name_key" ON "ODABuildingBlock"("name");

-- CreateIndex
CREATE INDEX "ODABuildingBlock_pillarId_idx" ON "ODABuildingBlock"("pillarId");

-- CreateIndex
CREATE INDEX "ODAQuestion_buildingBlockId_idx" ON "ODAQuestion"("buildingBlockId");

-- CreateIndex
CREATE INDEX "ODAAssessment_orgId_idx" ON "ODAAssessment"("orgId");

-- CreateIndex
CREATE INDEX "ODAAssessment_status_idx" ON "ODAAssessment"("status");

-- CreateIndex
CREATE INDEX "ODABlockResponse_assessmentId_idx" ON "ODABlockResponse"("assessmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ODABlockResponse_assessmentId_buildingBlockId_key" ON "ODABlockResponse"("assessmentId", "buildingBlockId");

-- AddForeignKey
ALTER TABLE "ODABuildingBlock" ADD CONSTRAINT "ODABuildingBlock_pillarId_fkey" FOREIGN KEY ("pillarId") REFERENCES "ODAPillar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ODAQuestion" ADD CONSTRAINT "ODAQuestion_buildingBlockId_fkey" FOREIGN KEY ("buildingBlockId") REFERENCES "ODABuildingBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ODAAssessment" ADD CONSTRAINT "ODAAssessment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ODABlockResponse" ADD CONSTRAINT "ODABlockResponse_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "ODAAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ODABlockResponse" ADD CONSTRAINT "ODABlockResponse_buildingBlockId_fkey" FOREIGN KEY ("buildingBlockId") REFERENCES "ODABuildingBlock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
