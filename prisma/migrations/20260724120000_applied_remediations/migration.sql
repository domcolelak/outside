-- CreateTable
CREATE TABLE "applied_remediations" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "handle" JSONB NOT NULL,
    "appliedBy" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rolledBackAt" TIMESTAMP(3),
    CONSTRAINT "applied_remediations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "applied_remediations_orgId_provider_target_idx" ON "applied_remediations"("orgId", "provider", "target");
