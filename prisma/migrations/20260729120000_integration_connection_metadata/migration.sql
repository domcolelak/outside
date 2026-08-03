-- Persist a non-secret provider validation snapshot so loading the integrations
-- page never consumes a customer's third-party API quota.
ALTER TABLE "integration_connections"
ADD COLUMN "metadata" JSONB NOT NULL DEFAULT '{}';
