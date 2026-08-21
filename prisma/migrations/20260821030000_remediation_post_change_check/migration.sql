-- Post-change verification of an applied remediation, observed over public DNS.
-- Nullable on purpose: rows written before this existed were never checked, and
-- an unchecked remediation must stay distinguishable from a verified one.
ALTER TABLE "applied_remediations" ADD COLUMN "verifiedAt" TIMESTAMP(3);
ALTER TABLE "applied_remediations" ADD COLUMN "verifyStatus" TEXT;
ALTER TABLE "applied_remediations" ADD COLUMN "verifyObserved" TEXT;
