-- Baseline matching the pre-migration schema. Existing db-push installations
-- must mark this migration applied before deploying later migrations; see
-- prisma/MIGRATIONS.md. New databases apply it normally.

CREATE TABLE "users" (
  "id" TEXT NOT NULL, "email" TEXT NOT NULL, "name" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE TABLE "organizations" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "slug" TEXT NOT NULL,
  "plan" TEXT NOT NULL DEFAULT 'free', "stripeCustomerId" TEXT,
  "stripeSubscriptionId" TEXT, "subscriptionStatus" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "organizations_stripeCustomerId_key" ON "organizations"("stripeCustomerId");

CREATE TABLE "memberships" (
  "userId" TEXT NOT NULL, "orgId" TEXT NOT NULL, "role" TEXT NOT NULL DEFAULT 'viewer',
  "notifyChanges" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "memberships_pkey" PRIMARY KEY ("userId", "orgId")
);

CREATE TABLE "invites" (
  "id" TEXT NOT NULL, "orgId" TEXT NOT NULL, "email" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'analyst', "token" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "acceptedAt" TIMESTAMP(3),
  CONSTRAINT "invites_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "invites_token_key" ON "invites"("token");
CREATE INDEX "invites_orgId_idx" ON "invites"("orgId");

CREATE TABLE "monitors" (
  "id" TEXT NOT NULL, "orgId" TEXT NOT NULL, "domain" TEXT NOT NULL,
  "frequency" TEXT NOT NULL DEFAULT 'daily', "enabled" BOOLEAN NOT NULL DEFAULT true,
  "lastScanAt" TIMESTAMP(3), "nextRunAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "monitors_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "monitors_enabled_nextRunAt_idx" ON "monitors"("enabled", "nextRunAt");

CREATE TABLE "targets" (
  "id" TEXT NOT NULL, "domain" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "targets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "targets_domain_key" ON "targets"("domain");

CREATE TABLE "scans" (
  "id" TEXT NOT NULL, "targetId" TEXT NOT NULL, "finishedAt" TIMESTAMP(3) NOT NULL,
  "mode" TEXT NOT NULL, "scoreValue" INTEGER NOT NULL, "assetCount" INTEGER NOT NULL,
  CONSTRAINT "scans_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "scans_targetId_finishedAt_idx" ON "scans"("targetId", "finishedAt");

CREATE TABLE "asset_identities" (
  "id" TEXT NOT NULL, "targetId" TEXT NOT NULL, "canonical" TEXT NOT NULL,
  "label" TEXT NOT NULL, "firstSeenAt" TIMESTAMP(3) NOT NULL, "lastSeenAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "asset_identities_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "asset_identities_targetId_canonical_key" ON "asset_identities"("targetId", "canonical");

CREATE TABLE "ai_analyses" (
  "id" TEXT NOT NULL, "scanId" TEXT, "target" TEXT NOT NULL, "kind" TEXT NOT NULL,
  "source" TEXT NOT NULL, "text" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_analyses_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ai_analyses_target_idx" ON "ai_analyses"("target");

CREATE TABLE "recommendation_states" (
  "target" TEXT NOT NULL, "recId" TEXT NOT NULL, "status" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "recommendation_states_pkey" PRIMARY KEY ("target", "recId")
);

CREATE TABLE "audit_events" (
  "id" TEXT NOT NULL, "target" TEXT, "orgId" TEXT, "actor" TEXT,
  "action" TEXT NOT NULL, "detail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audit_events_target_idx" ON "audit_events"("target");

CREATE TABLE "processed_events" (
  "id" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "processed_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "domain_verifications" (
  "domain" TEXT NOT NULL, "token" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'pending',
  "orgId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verifiedAt" TIMESTAMP(3), CONSTRAINT "domain_verifications_pkey" PRIMARY KEY ("domain")
);

CREATE TABLE "asset_snapshots" (
  "id" TEXT NOT NULL, "scanId" TEXT NOT NULL, "identityId" TEXT NOT NULL,
  "canonical" TEXT NOT NULL, "label" TEXT NOT NULL, "kind" TEXT NOT NULL,
  "priority" TEXT NOT NULL, "technologies" TEXT[], "status" TEXT,
  "present" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "asset_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "asset_snapshots_scanId_idx" ON "asset_snapshots"("scanId");
CREATE INDEX "asset_snapshots_identityId_idx" ON "asset_snapshots"("identityId");

ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invites" ADD CONSTRAINT "invites_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "monitors" ADD CONSTRAINT "monitors_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scans" ADD CONSTRAINT "scans_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "asset_identities" ADD CONSTRAINT "asset_identities_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "asset_snapshots" ADD CONSTRAINT "asset_snapshots_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "asset_snapshots" ADD CONSTRAINT "asset_snapshots_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "asset_identities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
