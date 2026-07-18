-- Guardian fleet scale: monthly range partitioning for append-only history,
-- per-tenant retention policy, and indexes for bounded cleanup jobs.

CREATE TABLE "guardian_retention_policies" (
  "orgId" TEXT NOT NULL,
  "scanDays" INTEGER NOT NULL DEFAULT 730,
  "snapshotDays" INTEGER NOT NULL DEFAULT 365,
  "eventDays" INTEGER NOT NULL DEFAULT 365,
  "deliveryDays" INTEGER NOT NULL DEFAULT 90,
  "activityDays" INTEGER NOT NULL DEFAULT 180,
  "digestDays" INTEGER NOT NULL DEFAULT 730,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "guardian_retention_policies_pkey" PRIMARY KEY ("orgId"),
  CONSTRAINT "guardian_retention_policies_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "guardian_retention_policy_bounds" CHECK (
    "scanDays" BETWEEN 30 AND 1825 AND
    "snapshotDays" BETWEEN 30 AND 1095 AND
    "eventDays" BETWEEN 30 AND 1095 AND
    "deliveryDays" BETWEEN 7 AND 365 AND
    "activityDays" BETWEEN 30 AND 730 AND
    "digestDays" BETWEEN 90 AND 1825
  )
);

CREATE INDEX "scans_orgId_finishedAt_idx" ON "scans"("orgId", "finishedAt");

-- Preserve existing rows while replacing the three append-only tables with
-- native monthly range-partitioned equivalents.
ALTER TABLE "guardian_snapshots" RENAME TO "guardian_snapshots_legacy";
ALTER TABLE "guardian_events" RENAME TO "guardian_events_legacy";
ALTER TABLE "guardian_activity" RENAME TO "guardian_activity_legacy";

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
  CONSTRAINT "guardian_snapshots_partitioned_pkey" PRIMARY KEY ("id", "observedAt"),
  CONSTRAINT "guardian_snapshots_partitioned_scan_key" UNIQUE ("scanId", "observedAt"),
  CONSTRAINT "guardian_snapshots_partitioned_org_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "guardian_snapshots_partitioned_scan_fkey" FOREIGN KEY ("scanId") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE
) PARTITION BY RANGE ("observedAt");

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
  CONSTRAINT "guardian_events_partitioned_pkey" PRIMARY KEY ("id", "observedAt"),
  CONSTRAINT "guardian_events_partitioned_group_key" UNIQUE ("orgId", "scanId", "groupKey", "observedAt"),
  CONSTRAINT "guardian_events_partitioned_org_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "guardian_events_partitioned_scan_fkey" FOREIGN KEY ("scanId") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE
) PARTITION BY RANGE ("observedAt");

CREATE TABLE "guardian_activity" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "target" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "guardian_activity_partitioned_pkey" PRIMARY KEY ("id", "createdAt"),
  CONSTRAINT "guardian_activity_partitioned_org_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
) PARTITION BY RANGE ("createdAt");

CREATE OR REPLACE FUNCTION guardian_ensure_monthly_partitions(
  reference_time TIMESTAMPTZ DEFAULT NOW(),
  months_before INTEGER DEFAULT 1,
  months_ahead INTEGER DEFAULT 12
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  parent_name TEXT;
  partition_column TEXT;
  month_offset INTEGER;
  month_start TIMESTAMP;
  month_end TIMESTAMP;
  partition_name TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('outside:guardian:partitions'));
  FOR parent_name, partition_column IN
    SELECT * FROM (VALUES
      ('guardian_snapshots', 'observedAt'),
      ('guardian_events', 'observedAt'),
      ('guardian_activity', 'createdAt')
    ) AS partition_targets(parent_name, partition_column)
  LOOP
    FOR month_offset IN -months_before..months_ahead LOOP
      month_start := date_trunc('month', reference_time) + make_interval(months => month_offset);
      month_end := month_start + INTERVAL '1 month';
      partition_name := parent_name || '_' || to_char(month_start, 'YYYY_MM');
      BEGIN
        EXECUTE format(
          'CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
          partition_name, parent_name, month_start, month_end
        );
      EXCEPTION WHEN check_violation THEN
        -- Rows may already be in the default partition after a long scheduler
        -- outage. Leave them queryable there; later months still partition.
        RAISE WARNING 'Could not attach partition % because matching rows exist in the default partition', partition_name;
      END;
    END LOOP;
  END LOOP;
END;
$$;

SELECT guardian_ensure_monthly_partitions(NOW(), 36, 12);
CREATE TABLE "guardian_snapshots_default" PARTITION OF "guardian_snapshots" DEFAULT;
CREATE TABLE "guardian_events_default" PARTITION OF "guardian_events" DEFAULT;
CREATE TABLE "guardian_activity_default" PARTITION OF "guardian_activity" DEFAULT;

CREATE INDEX "guardian_snapshots_partitioned_org_target_time_idx" ON "guardian_snapshots"("orgId", "target", "observedAt");
CREATE INDEX "guardian_events_partitioned_org_target_time_idx" ON "guardian_events"("orgId", "target", "observedAt");
CREATE INDEX "guardian_events_partitioned_org_severity_time_idx" ON "guardian_events"("orgId", "severity", "observedAt");
CREATE INDEX "guardian_activity_partitioned_org_time_idx" ON "guardian_activity"("orgId", "createdAt");

INSERT INTO "guardian_snapshots" SELECT "id", "orgId", "scanId", "target", "observedAt", "exposureScore", "metrics", "inventory", "checklist" FROM "guardian_snapshots_legacy";
INSERT INTO "guardian_events" SELECT "id", "orgId", "scanId", "target", "type", "category", "severity", "confidence", "title", "summary", "why", "affectedAssets", "evidence", "groupKey", "observedAt" FROM "guardian_events_legacy";
INSERT INTO "guardian_activity" SELECT "id", "orgId", "target", "type", "message", "createdAt" FROM "guardian_activity_legacy";

DROP TABLE "guardian_snapshots_legacy";
DROP TABLE "guardian_events_legacy";
DROP TABLE "guardian_activity_legacy";
