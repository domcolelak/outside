-- CreateTable
CREATE TABLE "provider_usage_events" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "status" INTEGER,
    "errorCode" TEXT,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "provider_usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_audit_events" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "provider_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "provider_usage_events_orgId_provider_createdAt_idx" ON "provider_usage_events"("orgId", "provider", "createdAt");

-- CreateIndex
CREATE INDEX "provider_audit_events_orgId_provider_createdAt_idx" ON "provider_audit_events"("orgId", "provider", "createdAt");
