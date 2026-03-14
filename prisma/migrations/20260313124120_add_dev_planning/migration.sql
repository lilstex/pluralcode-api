-- CreateTable
CREATE TABLE "DevPlanPriorityArea" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "pillarId" TEXT NOT NULL,
    "buildingBlockId" TEXT NOT NULL,
    "indicatorId" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "strength" TEXT,
    "weakness" TEXT,
    "opportunity" TEXT,
    "threat" TEXT,
    "priority" INTEGER NOT NULL,
    "act" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DevPlanPriorityArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevPlanActionPlan" (
    "id" TEXT NOT NULL,
    "priorityAreaId" TEXT NOT NULL,
    "objective" TEXT,
    "kpi" TEXT,
    "actionSteps" TEXT,
    "responsiblePerson" TEXT,
    "timeline" TIMESTAMP(3),
    "support" TEXT,
    "resourcePlan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DevPlanActionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevPlanEvaluation" (
    "id" TEXT NOT NULL,
    "priorityAreaId" TEXT NOT NULL,
    "whatWasDone" TEXT,
    "wereObjectivesMet" TEXT,
    "whatDidWeLearn" TEXT,
    "nextSteps" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DevPlanEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DevPlanPriorityArea_orgId_idx" ON "DevPlanPriorityArea"("orgId");

-- CreateIndex
CREATE INDEX "DevPlanPriorityArea_pillarId_idx" ON "DevPlanPriorityArea"("pillarId");

-- CreateIndex
CREATE INDEX "DevPlanPriorityArea_buildingBlockId_idx" ON "DevPlanPriorityArea"("buildingBlockId");

-- CreateIndex
CREATE INDEX "DevPlanPriorityArea_indicatorId_idx" ON "DevPlanPriorityArea"("indicatorId");

-- CreateIndex
CREATE UNIQUE INDEX "DevPlanActionPlan_priorityAreaId_key" ON "DevPlanActionPlan"("priorityAreaId");

-- CreateIndex
CREATE UNIQUE INDEX "DevPlanEvaluation_priorityAreaId_key" ON "DevPlanEvaluation"("priorityAreaId");

-- AddForeignKey
ALTER TABLE "DevPlanPriorityArea" ADD CONSTRAINT "DevPlanPriorityArea_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevPlanPriorityArea" ADD CONSTRAINT "DevPlanPriorityArea_pillarId_fkey" FOREIGN KEY ("pillarId") REFERENCES "ODAPillar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevPlanPriorityArea" ADD CONSTRAINT "DevPlanPriorityArea_buildingBlockId_fkey" FOREIGN KEY ("buildingBlockId") REFERENCES "ODABuildingBlock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevPlanPriorityArea" ADD CONSTRAINT "DevPlanPriorityArea_indicatorId_fkey" FOREIGN KEY ("indicatorId") REFERENCES "ODAQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevPlanActionPlan" ADD CONSTRAINT "DevPlanActionPlan_priorityAreaId_fkey" FOREIGN KEY ("priorityAreaId") REFERENCES "DevPlanPriorityArea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevPlanEvaluation" ADD CONSTRAINT "DevPlanEvaluation_priorityAreaId_fkey" FOREIGN KEY ("priorityAreaId") REFERENCES "DevPlanPriorityArea"("id") ON DELETE CASCADE ON UPDATE CASCADE;
