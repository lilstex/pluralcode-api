-- CreateTable
CREATE TABLE "ODAQuestionOption" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "scaleValue" INTEGER NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "questionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ODAQuestionOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ODAPillarSummary" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "pillarId" TEXT NOT NULL,
    "pillarScore" DOUBLE PRECISION NOT NULL,
    "aiSummary" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ODAPillarSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ODAQuestionOption_questionId_idx" ON "ODAQuestionOption"("questionId");

-- CreateIndex
CREATE INDEX "ODAPillarSummary_assessmentId_idx" ON "ODAPillarSummary"("assessmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ODAPillarSummary_assessmentId_pillarId_key" ON "ODAPillarSummary"("assessmentId", "pillarId");

-- AddForeignKey
ALTER TABLE "ODAQuestionOption" ADD CONSTRAINT "ODAQuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "ODAQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ODAPillarSummary" ADD CONSTRAINT "ODAPillarSummary_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "ODAAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ODAPillarSummary" ADD CONSTRAINT "ODAPillarSummary_pillarId_fkey" FOREIGN KEY ("pillarId") REFERENCES "ODAPillar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
