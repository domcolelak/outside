-- At most one live OUTSIDE-applied action may exist per organization/target.
-- The route also serializes provider writes; this constraint is the final
-- defence against duplicate active remediation records.
CREATE UNIQUE INDEX "applied_remediations_one_active_action"
ON "applied_remediations" ("orgId", "provider", "target", "action")
WHERE "rolledBackAt" IS NULL;
