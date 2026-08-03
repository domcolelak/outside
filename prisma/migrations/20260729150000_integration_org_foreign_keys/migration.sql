-- Organization offboarding must remove encrypted credentials, provider
-- telemetry/audit state, remediation handles and assessment history.
ALTER TABLE "integration_connections"
ADD CONSTRAINT "integration_connections_orgId_fkey"
FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "provider_usage_events"
ADD CONSTRAINT "provider_usage_events_orgId_fkey"
FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "provider_audit_events"
ADD CONSTRAINT "provider_audit_events_orgId_fkey"
FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "applied_remediations"
ADD CONSTRAINT "applied_remediations_orgId_fkey"
FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "assessment_runs"
ADD CONSTRAINT "assessment_runs_orgId_fkey"
FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
