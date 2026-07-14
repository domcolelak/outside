-- Security migration from the original global-domain model to explicit tenant
-- ownership. Legacy target history and recommendation state cannot be assigned
-- to a tenant without risking disclosure, so those ambiguous rows are removed.

CREATE TYPE "Role" AS ENUM ('owner', 'admin', 'analyst', 'viewer');
CREATE TYPE "Plan" AS ENUM ('free', 'professional', 'agency');
CREATE TYPE "MonitorFrequency" AS ENUM ('daily', 'weekly');
CREATE TYPE "ScanMode" AS ENUM ('passive', 'demo');
CREATE TYPE "VerificationStatus" AS ENUM ('pending', 'verified');
CREATE TYPE "RecommendationStatus" AS ENUM ('open', 'acknowledged', 'in_progress', 'resolved', 'dismissed');
CREATE TYPE "Priority" AS ENUM ('info', 'low', 'medium', 'high', 'critical');
CREATE TYPE "AssetKind" AS ENUM ('root_domain', 'subdomain', 'host', 'ip', 'web_service', 'mail_service', 'dns_provider', 'nameserver', 'certificate', 'cloud_provider', 'cdn', 'technology', 'auth_surface', 'api_surface', 'third_party', 'unknown');

ALTER TABLE "memberships" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "memberships" ALTER COLUMN "role" TYPE "Role" USING "role"::text::"Role";
ALTER TABLE "memberships" ALTER COLUMN "role" SET DEFAULT 'viewer';
ALTER TABLE "organizations" ALTER COLUMN "plan" DROP DEFAULT;
ALTER TABLE "organizations" ALTER COLUMN "plan" TYPE "Plan" USING "plan"::text::"Plan";
ALTER TABLE "organizations" ALTER COLUMN "plan" SET DEFAULT 'free';
ALTER TABLE "invites" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "invites" ALTER COLUMN "role" TYPE "Role" USING "role"::text::"Role";
ALTER TABLE "invites" ALTER COLUMN "role" SET DEFAULT 'analyst';
ALTER TABLE "monitors" ALTER COLUMN "frequency" DROP DEFAULT;
ALTER TABLE "monitors" ALTER COLUMN "frequency" TYPE "MonitorFrequency" USING "frequency"::text::"MonitorFrequency";
ALTER TABLE "monitors" ALTER COLUMN "frequency" SET DEFAULT 'daily';
ALTER TABLE "scans" ALTER COLUMN "mode" TYPE "ScanMode" USING "mode"::text::"ScanMode";
ALTER TABLE "asset_snapshots" ALTER COLUMN "kind" TYPE "AssetKind" USING "kind"::text::"AssetKind";
ALTER TABLE "asset_snapshots" ALTER COLUMN "priority" TYPE "Priority" USING "priority"::text::"Priority";
ALTER TABLE "recommendation_states" ALTER COLUMN "status" TYPE "RecommendationStatus" USING "status"::text::"RecommendationStatus";
ALTER TABLE "domain_verifications" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "domain_verifications" ALTER COLUMN "status" TYPE "VerificationStatus" USING "status"::text::"VerificationStatus";
ALTER TABLE "domain_verifications" ALTER COLUMN "status" SET DEFAULT 'pending';

ALTER TABLE "users" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "invites" ADD COLUMN "tokenHash" TEXT;
ALTER TABLE "invites" ADD COLUMN "createdBy" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "invites" ADD COLUMN "expiresAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "invites" ADD COLUMN "revokedAt" TIMESTAMP(3);
ALTER TABLE "invites" ALTER COLUMN "token" DROP NOT NULL;
UPDATE "invites" SET "revokedAt" = CURRENT_TIMESTAMP WHERE "tokenHash" IS NULL AND "acceptedAt" IS NULL;
CREATE UNIQUE INDEX "invites_tokenHash_key" ON "invites"("tokenHash");
DROP INDEX "invites_orgId_idx";
CREATE INDEX "invites_orgId_acceptedAt_expiresAt_idx" ON "invites"("orgId", "acceptedAt", "expiresAt");

DELETE FROM "monitors" a USING "monitors" b WHERE a."orgId" = b."orgId" AND a."domain" = b."domain" AND a."id" > b."id";
ALTER TABLE "monitors" ADD COLUMN "leaseId" TEXT;
ALTER TABLE "monitors" ADD COLUMN "leaseUntil" TIMESTAMP(3);
ALTER TABLE "monitors" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "monitors" ADD COLUMN "lastError" TEXT;
DROP INDEX "monitors_enabled_nextRunAt_idx";
CREATE UNIQUE INDEX "monitors_orgId_domain_key" ON "monitors"("orgId", "domain");
CREATE INDEX "monitors_enabled_nextRunAt_leaseUntil_idx" ON "monitors"("enabled", "nextRunAt", "leaseUntil");

DELETE FROM "targets";
DROP INDEX "targets_domain_key";
ALTER TABLE "targets" ADD COLUMN "orgId" TEXT NOT NULL;
CREATE UNIQUE INDEX "targets_orgId_domain_key" ON "targets"("orgId", "domain");
ALTER TABLE "targets" ADD CONSTRAINT "targets_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scans" ADD COLUMN "orgId" TEXT NOT NULL;

DELETE FROM "recommendation_states";
ALTER TABLE "recommendation_states" DROP CONSTRAINT "recommendation_states_pkey";
ALTER TABLE "recommendation_states" ADD COLUMN "orgId" TEXT NOT NULL;
ALTER TABLE "recommendation_states" ADD CONSTRAINT "recommendation_states_pkey" PRIMARY KEY ("orgId", "target", "recId");
CREATE INDEX "recommendation_states_orgId_target_idx" ON "recommendation_states"("orgId", "target");

DELETE FROM "audit_events" WHERE "target" IS NULL OR "orgId" IS NULL OR "actor" IS NULL;
ALTER TABLE "audit_events" ALTER COLUMN "target" SET NOT NULL;
ALTER TABLE "audit_events" ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "audit_events" ALTER COLUMN "actor" SET NOT NULL;

DELETE FROM "domain_verifications" WHERE "orgId" IS NULL;
ALTER TABLE "domain_verifications" DROP CONSTRAINT "domain_verifications_pkey";
ALTER TABLE "domain_verifications" ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "domain_verifications" ADD CONSTRAINT "domain_verifications_pkey" PRIMARY KEY ("orgId", "domain");
CREATE INDEX "domain_verifications_domain_status_idx" ON "domain_verifications"("domain", "status");
ALTER TABLE "domain_verifications" ADD CONSTRAINT "domain_verifications_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "asset_snapshots" ADD COLUMN "certKey" TEXT;

CREATE TABLE "rate_limit_buckets" (
  "key" TEXT NOT NULL, "count" INTEGER NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "rate_limit_buckets_expiresAt_idx" ON "rate_limit_buckets"("expiresAt");

CREATE TABLE "concurrency_leases" (
  "id" TEXT NOT NULL, "scope" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "concurrency_leases_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "concurrency_leases_scope_expiresAt_idx" ON "concurrency_leases"("scope", "expiresAt");

CREATE TABLE "usage_events" (
  "id" TEXT NOT NULL, "orgId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL, "units" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "usage_events_orgId_kind_createdAt_idx" ON "usage_events"("orgId", "kind", "createdAt");
CREATE INDEX "usage_events_userId_createdAt_idx" ON "usage_events"("userId", "createdAt");

CREATE TABLE "email_outbox" (
  "id" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL, "to" TEXT NOT NULL,
  "subject" TEXT NOT NULL, "html" TEXT NOT NULL, "text" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending', "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "leaseId" TEXT,
  "leasedUntil" TIMESTAMP(3), "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "sentAt" TIMESTAMP(3),
  CONSTRAINT "email_outbox_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "email_outbox_idempotencyKey_key" ON "email_outbox"("idempotencyKey");
CREATE INDEX "email_outbox_status_nextAttemptAt_leasedUntil_idx" ON "email_outbox"("status", "nextAttemptAt", "leasedUntil");
