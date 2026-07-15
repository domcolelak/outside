ALTER TABLE "agency_sla_events"
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'open',
  ADD COLUMN "acknowledgedAt" TIMESTAMP(3),
  ADD COLUMN "acknowledgedBy" TEXT,
  ADD COLUMN "lastObservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "escalatedAt" TIMESTAMP(3);

CREATE INDEX "agency_sla_events_status_dueAt_idx"
  ON "agency_sla_events"("status", "dueAt");

CREATE TABLE "agency_report_shares" (
  "id" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "agencyId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agency_report_shares_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agency_report_shares_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "agency_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "agency_report_shares_tokenHash_key" ON "agency_report_shares"("tokenHash");
CREATE INDEX "agency_report_shares_agencyId_reportId_expiresAt_idx" ON "agency_report_shares"("agencyId", "reportId", "expiresAt");
