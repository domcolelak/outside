-- CreateTable
CREATE TABLE "assessment_runs" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "catalogueVersion" TEXT NOT NULL,
    "passed" INTEGER NOT NULL,
    "failed" INTEGER NOT NULL,
    "results" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "assessment_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assessment_runs_orgId_target_createdAt_idx" ON "assessment_runs"("orgId", "target", "createdAt");
