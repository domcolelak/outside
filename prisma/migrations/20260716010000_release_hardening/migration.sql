-- Online indexes for bounded operational retention. Prisma applies PostgreSQL
-- migrations without an implicit transaction, allowing CONCURRENTLY here.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "processed_events_createdAt_idx"
  ON "processed_events"("createdAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "email_outbox_status_sentAt_idx"
  ON "email_outbox"("status", "sentAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "usage_events_createdAt_idx"
  ON "usage_events"("createdAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "concurrency_leases_expiresAt_idx"
  ON "concurrency_leases"("expiresAt");
