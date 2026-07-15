-- Immutable Guardian evidence snapshots. Rows are insert-only in application
-- code and partitioned with the rest of Guardian's fleet-scale history.
CREATE TABLE "guardian_evidence_snapshots" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "scanId" TEXT NOT NULL,
  "target" TEXT NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "contentHash" TEXT NOT NULL,
  "recordCount" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  CONSTRAINT "guardian_evidence_snapshots_pkey" PRIMARY KEY ("id", "observedAt"),
  CONSTRAINT "guardian_evidence_snapshots_scan_key" UNIQUE ("scanId", "observedAt"),
  CONSTRAINT "guardian_evidence_snapshots_org_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "guardian_evidence_snapshots_scan_fkey" FOREIGN KEY ("scanId") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "guardian_evidence_snapshots_hash_format" CHECK ("contentHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "guardian_evidence_snapshots_count" CHECK ("recordCount" >= 0),
  CONSTRAINT "guardian_evidence_snapshots_seal" CHECK (("snapshot" ->> 'contentHash') = "contentHash")
) PARTITION BY RANGE ("observedAt");

CREATE TABLE "guardian_evidence_snapshots_default" PARTITION OF "guardian_evidence_snapshots" DEFAULT;
CREATE INDEX "guardian_evidence_org_target_time_idx" ON "guardian_evidence_snapshots"("orgId", "target", "observedAt");
CREATE INDEX "guardian_evidence_org_hash_idx" ON "guardian_evidence_snapshots"("orgId", "contentHash");
CREATE INDEX "guardian_evidence_snapshot_gin_idx" ON "guardian_evidence_snapshots" USING GIN ("snapshot" jsonb_path_ops);

CREATE OR REPLACE FUNCTION guardian_reject_evidence_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Guardian evidence snapshots are immutable';
END;
$$;

CREATE TRIGGER guardian_evidence_immutable_update
BEFORE UPDATE ON "guardian_evidence_snapshots"
FOR EACH ROW EXECUTE FUNCTION guardian_reject_evidence_mutation();

-- Recreate the partition maintenance function with evidence snapshots in its
-- managed set. CREATE OR REPLACE preserves the scheduler-facing API.
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
      ('guardian_evidence_snapshots', 'observedAt'),
      ('guardian_events', 'observedAt'),
      ('guardian_activity', 'createdAt')
    ) AS partition_targets(parent_name, partition_column)
  LOOP
    FOR month_offset IN -months_before..months_ahead LOOP
      month_start := date_trunc('month', reference_time) + make_interval(months => month_offset);
      month_end := month_start + INTERVAL '1 month';
      partition_name := parent_name || '_' || to_char(month_start, 'YYYY_MM');
      BEGIN
        EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)', partition_name, parent_name, month_start, month_end);
      EXCEPTION WHEN check_violation THEN
        RAISE WARNING 'Could not attach partition % because matching rows exist in the default partition', partition_name;
      END;
    END LOOP;
  END LOOP;
END;
$$;

SELECT guardian_ensure_monthly_partitions(NOW(), 36, 12);
