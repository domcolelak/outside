-- AI output was intentionally isolated from deterministic facts, but the
-- original table lacked the organization boundary required for safe retrieval.
-- Rows that cannot be tied to an existing scan have no trustworthy tenant and
-- are removed instead of being guessed into an organization.
ALTER TABLE "ai_analyses" ADD COLUMN "orgId" TEXT;

UPDATE "ai_analyses" AS analysis
SET "orgId" = scan."orgId"
FROM "scans" AS scan
WHERE analysis."scanId" = scan."id";

DELETE FROM "ai_analyses"
WHERE "orgId" IS NULL;

ALTER TABLE "ai_analyses" ALTER COLUMN "orgId" SET NOT NULL;

DROP INDEX IF EXISTS "ai_analyses_target_idx";
CREATE INDEX "ai_analyses_orgId_target_createdAt_idx"
  ON "ai_analyses"("orgId", "target", "createdAt");
CREATE INDEX "ai_analyses_scanId_orgId_idx"
  ON "ai_analyses"("scanId", "orgId");

CREATE UNIQUE INDEX "scans_id_orgId_key" ON "scans"("id", "orgId");

ALTER TABLE "ai_analyses"
  ADD CONSTRAINT "ai_analyses_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_analyses"
  ADD CONSTRAINT "ai_analyses_scanId_orgId_fkey"
  FOREIGN KEY ("scanId", "orgId") REFERENCES "scans"("id", "orgId")
  ON DELETE CASCADE ON UPDATE CASCADE;
