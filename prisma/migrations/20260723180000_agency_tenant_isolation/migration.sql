ALTER TABLE "agency_bulk_jobs"
  DROP CONSTRAINT "agency_bulk_jobs_idempotencyKey_key";

CREATE UNIQUE INDEX "agency_bulk_jobs_agencyId_idempotencyKey_key"
  ON "agency_bulk_jobs"("agencyId", "idempotencyKey");
