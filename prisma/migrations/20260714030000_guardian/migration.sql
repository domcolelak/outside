-- OUTSIDE Guardian: durable observations, correlated events, recommendations,
-- encrypted delivery configuration, retryable notification outbox, and digests.

CREATE TABLE "guardian_snapshots" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "scanId" TEXT NOT NULL,
  "target" TEXT NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "exposureScore" INTEGER NOT NULL,
  "metrics" JSONB NOT NULL,
  "inventory" JSONB NOT NULL,
  "checklist" JSONB NOT NULL,
  CONSTRAINT "guardian_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "guardian_snapshots_scanId_key" ON "guardian_snapshots"("scanId");
CREATE INDEX "guardian_snapshots_orgId_target_observedAt_idx" ON "guardian_snapshots"("orgId", "target", "observedAt");

CREATE TABLE "guardian_events" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "scanId" TEXT NOT NULL,
  "target" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "severity" "Priority" NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "why" TEXT NOT NULL,
  "affectedAssets" TEXT[] NOT NULL,
  "evidence" JSONB NOT NULL,
  "groupKey" TEXT NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "guardian_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "guardian_events_orgId_scanId_groupKey_key" ON "guardian_events"("orgId", "scanId", "groupKey");
CREATE INDEX "guardian_events_orgId_target_observedAt_idx" ON "guardian_events"("orgId", "target", "observedAt");
CREATE INDEX "guardian_events_orgId_severity_observedAt_idx" ON "guardian_events"("orgId", "severity", "observedAt");

CREATE TABLE "guardian_recommendations" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "target" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "status" "RecommendationStatus" NOT NULL DEFAULT 'open',
  "priority" "Priority" NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "title" TEXT NOT NULL,
  "why" TEXT NOT NULL,
  "reasoning" TEXT NOT NULL,
  "affectedAssets" TEXT[] NOT NULL,
  "evidence" JSONB NOT NULL,
  "suggestedReview" TEXT NOT NULL,
  "businessImpact" TEXT NOT NULL,
  "guides" JSONB NOT NULL,
  "firstObservedAt" TIMESTAMP(3) NOT NULL,
  "lastObservedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "guardian_recommendations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "guardian_recommendations_orgId_target_code_key" ON "guardian_recommendations"("orgId", "target", "code");
CREATE INDEX "guardian_recommendations_orgId_target_status_priority_idx" ON "guardian_recommendations"("orgId", "target", "status", "priority");

CREATE TABLE "guardian_channels" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "encryptedConfig" TEXT NOT NULL,
  "destinationHint" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "guardian_channels_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "guardian_channels_orgId_enabled_idx" ON "guardian_channels"("orgId", "enabled");

CREATE TABLE "guardian_deliveries" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "channelId" TEXT,
  "channelType" TEXT NOT NULL,
  "target" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "itemCount" INTEGER NOT NULL,
  "payload" JSONB NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseId" TEXT,
  "leasedUntil" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveredAt" TIMESTAMP(3),
  CONSTRAINT "guardian_deliveries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "guardian_deliveries_idempotencyKey_key" ON "guardian_deliveries"("idempotencyKey");
CREATE INDEX "guardian_deliveries_status_nextAttemptAt_leasedUntil_idx" ON "guardian_deliveries"("status", "nextAttemptAt", "leasedUntil");
CREATE INDEX "guardian_deliveries_orgId_createdAt_idx" ON "guardian_deliveries"("orgId", "createdAt");

CREATE TABLE "guardian_digests" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "target" TEXT NOT NULL,
  "weekOf" TIMESTAMP(3) NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL,
  "content" JSONB NOT NULL,
  CONSTRAINT "guardian_digests_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "guardian_digests_orgId_target_weekOf_key" ON "guardian_digests"("orgId", "target", "weekOf");
CREATE INDEX "guardian_digests_orgId_generatedAt_idx" ON "guardian_digests"("orgId", "generatedAt");

CREATE TABLE "guardian_activity" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "target" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "guardian_activity_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "guardian_activity_orgId_createdAt_idx" ON "guardian_activity"("orgId", "createdAt");

ALTER TABLE "guardian_snapshots" ADD CONSTRAINT "guardian_snapshots_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guardian_snapshots" ADD CONSTRAINT "guardian_snapshots_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guardian_events" ADD CONSTRAINT "guardian_events_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guardian_events" ADD CONSTRAINT "guardian_events_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guardian_recommendations" ADD CONSTRAINT "guardian_recommendations_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guardian_channels" ADD CONSTRAINT "guardian_channels_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guardian_deliveries" ADD CONSTRAINT "guardian_deliveries_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guardian_deliveries" ADD CONSTRAINT "guardian_deliveries_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "guardian_channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "guardian_digests" ADD CONSTRAINT "guardian_digests_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guardian_activity" ADD CONSTRAINT "guardian_activity_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
