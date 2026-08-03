-- Support bounded global retention without scanning tenant-prefixed indexes.
CREATE INDEX "provider_usage_events_createdAt_idx"
ON "provider_usage_events"("createdAt");

CREATE INDEX "assessment_runs_createdAt_idx"
ON "assessment_runs"("createdAt");
