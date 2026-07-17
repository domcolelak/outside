-- Retention indexes are idempotent and transaction-safe because Prisma deploys
-- PostgreSQL migrations inside a transaction. For already-large installations,
-- create equivalent indexes concurrently in a reviewed maintenance operation
-- before deploying this migration; IF NOT EXISTS then makes deployment a no-op.
CREATE INDEX IF NOT EXISTS "processed_events_createdAt_idx"
  ON "processed_events"("createdAt");
CREATE INDEX IF NOT EXISTS "email_outbox_status_sentAt_idx"
  ON "email_outbox"("status", "sentAt");
CREATE INDEX IF NOT EXISTS "usage_events_createdAt_idx"
  ON "usage_events"("createdAt");
CREATE INDEX IF NOT EXISTS "concurrency_leases_expiresAt_idx"
  ON "concurrency_leases"("expiresAt");
