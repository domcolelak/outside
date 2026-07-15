CREATE TYPE "AgencyRole" AS ENUM ('owner','admin','manager','analyst','billing','viewer');
CREATE TYPE "AgencyClientStatus" AS ENUM ('onboarding','active','paused','offboarded');
CREATE TYPE "AgencyPortalMode" AS ENUM ('disabled','readonly','collaborative');
CREATE TYPE "AgencyJobStatus" AS ENUM ('queued','running','completed','partially_failed','failed','cancelled');

CREATE TABLE "agency_workspaces" (
  "id" TEXT PRIMARY KEY, "ownerOrgId" TEXT NOT NULL UNIQUE, "name" TEXT NOT NULL, "slug" TEXT NOT NULL UNIQUE,
  "whiteLabel" BOOLEAN NOT NULL DEFAULT false, "consultantMode" BOOLEAN NOT NULL DEFAULT true,
  "logoUrl" TEXT, "primaryColor" TEXT NOT NULL DEFAULT '#38e1c3', "accentColor" TEXT NOT NULL DEFAULT '#5b8cff',
  "supportEmail" TEXT, "customDomain" TEXT UNIQUE, "emailFromName" TEXT, "emailFooter" TEXT, "resellerParentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "agency_workspaces_resellerParentId_idx" ON "agency_workspaces"("resellerParentId");
ALTER TABLE "agency_workspaces" ADD CONSTRAINT "agency_workspaces_ownerOrgId_fkey" FOREIGN KEY ("ownerOrgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agency_workspaces" ADD CONSTRAINT "agency_workspaces_resellerParentId_fkey" FOREIGN KEY ("resellerParentId") REFERENCES "agency_workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "agency_memberships" ("agencyId" TEXT NOT NULL,"userId" TEXT NOT NULL,"role" "AgencyRole" NOT NULL DEFAULT 'viewer',"seatLabel" TEXT,"active" BOOLEAN NOT NULL DEFAULT true,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY("agencyId","userId"));
CREATE INDEX "agency_memberships_userId_active_idx" ON "agency_memberships"("userId","active");
ALTER TABLE "agency_memberships" ADD CONSTRAINT "agency_memberships_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agency_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agency_memberships" ADD CONSTRAINT "agency_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "agency_groups" ("id" TEXT PRIMARY KEY,"agencyId" TEXT NOT NULL,"name" TEXT NOT NULL,"color" TEXT NOT NULL DEFAULT '#5b8cff',"description" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX "agency_groups_agencyId_name_key" ON "agency_groups"("agencyId","name");
CREATE UNIQUE INDEX "agency_groups_agencyId_lower_name_key" ON "agency_groups"("agencyId",LOWER("name"));
ALTER TABLE "agency_groups" ADD CONSTRAINT "agency_groups_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agency_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "agency_clients" ("id" TEXT PRIMARY KEY,"agencyId" TEXT NOT NULL,"orgId" TEXT NOT NULL,"groupId" TEXT,"status" "AgencyClientStatus" NOT NULL DEFAULT 'onboarding',"portalMode" "AgencyPortalMode" NOT NULL DEFAULT 'readonly',"externalRef" TEXT,"serviceTier" TEXT NOT NULL DEFAULT 'standard',"slaResponseMinutes" INTEGER NOT NULL DEFAULT 480,"notificationRouting" JSONB NOT NULL DEFAULT '{}',"billingMode" TEXT NOT NULL DEFAULT 'agency',"monthlyPriceCents" INTEGER,"currency" TEXT NOT NULL DEFAULT 'EUR',"addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"offboardedAt" TIMESTAMP(3));
CREATE UNIQUE INDEX "agency_clients_agencyId_orgId_key" ON "agency_clients"("agencyId","orgId");
CREATE INDEX "agency_clients_agencyId_status_groupId_idx" ON "agency_clients"("agencyId","status","groupId");
ALTER TABLE "agency_clients" ADD CONSTRAINT "agency_clients_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agency_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agency_clients" ADD CONSTRAINT "agency_clients_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agency_clients" ADD CONSTRAINT "agency_clients_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "agency_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "agency_invites" ("id" TEXT PRIMARY KEY,"agencyId" TEXT NOT NULL,"email" TEXT NOT NULL,"role" "AgencyRole" NOT NULL,"kind" TEXT NOT NULL DEFAULT 'seat',"clientId" TEXT,"tokenHash" TEXT NOT NULL UNIQUE,"createdBy" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"expiresAt" TIMESTAMP(3) NOT NULL,"acceptedAt" TIMESTAMP(3),"acceptedBy" TEXT,"revokedAt" TIMESTAMP(3));
CREATE INDEX "agency_invites_agencyId_email_acceptedAt_expiresAt_idx" ON "agency_invites"("agencyId","email","acceptedAt","expiresAt");
ALTER TABLE "agency_invites" ADD CONSTRAINT "agency_invites_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agency_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agency_invites" ADD CONSTRAINT "agency_invites_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "agency_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "agency_notes" ("id" TEXT PRIMARY KEY,"agencyId" TEXT NOT NULL,"clientId" TEXT NOT NULL,"authorId" TEXT NOT NULL,"body" TEXT NOT NULL,"visibility" TEXT NOT NULL DEFAULT 'internal',"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL);
CREATE INDEX "agency_notes_agencyId_clientId_createdAt_idx" ON "agency_notes"("agencyId","clientId","createdAt");
ALTER TABLE "agency_notes" ADD CONSTRAINT "agency_notes_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agency_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agency_notes" ADD CONSTRAINT "agency_notes_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "agency_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "agency_finding_shares" ("id" TEXT PRIMARY KEY,"agencyId" TEXT NOT NULL,"clientId" TEXT NOT NULL,"recommendationId" TEXT NOT NULL,"sharedBy" TEXT NOT NULL,"clientMessage" TEXT,"status" TEXT NOT NULL DEFAULT 'shared',"sharedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX "agency_finding_shares_agencyId_clientId_recommendationId_key" ON "agency_finding_shares"("agencyId","clientId","recommendationId");
CREATE INDEX "agency_finding_shares_clientId_sharedAt_idx" ON "agency_finding_shares"("clientId","sharedAt");
ALTER TABLE "agency_finding_shares" ADD CONSTRAINT "agency_finding_shares_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agency_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agency_finding_shares" ADD CONSTRAINT "agency_finding_shares_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "agency_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "agency_bulk_jobs" ("id" TEXT PRIMARY KEY,"agencyId" TEXT NOT NULL,"type" TEXT NOT NULL,"status" "AgencyJobStatus" NOT NULL DEFAULT 'queued',"idempotencyKey" TEXT NOT NULL UNIQUE,"clientOrgIds" TEXT[] NOT NULL,"payload" JSONB NOT NULL DEFAULT '{}',"result" JSONB,"createdBy" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"startedAt" TIMESTAMP(3),"completedAt" TIMESTAMP(3));
CREATE INDEX "agency_bulk_jobs_agencyId_status_createdAt_idx" ON "agency_bulk_jobs"("agencyId","status","createdAt");
ALTER TABLE "agency_bulk_jobs" ADD CONSTRAINT "agency_bulk_jobs_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agency_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "agency_reports" ("id" TEXT PRIMARY KEY,"agencyId" TEXT NOT NULL,"clientOrgId" TEXT,"periodStart" TIMESTAMP(3) NOT NULL,"periodEnd" TIMESTAMP(3) NOT NULL,"kind" TEXT NOT NULL,"status" TEXT NOT NULL DEFAULT 'ready',"title" TEXT NOT NULL,"content" JSONB NOT NULL,"branding" JSONB NOT NULL,"createdBy" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "agency_reports_agencyId_clientOrgId_createdAt_idx" ON "agency_reports"("agencyId","clientOrgId","createdAt");
ALTER TABLE "agency_reports" ADD CONSTRAINT "agency_reports_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agency_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "agency_api_keys" ("id" TEXT PRIMARY KEY,"agencyId" TEXT NOT NULL,"name" TEXT NOT NULL,"prefix" TEXT NOT NULL,"secretHash" TEXT NOT NULL UNIQUE,"scopes" TEXT[] NOT NULL,"createdBy" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"lastUsedAt" TIMESTAMP(3),"expiresAt" TIMESTAMP(3),"revokedAt" TIMESTAMP(3));
CREATE INDEX "agency_api_keys_agencyId_revokedAt_idx" ON "agency_api_keys"("agencyId","revokedAt");
ALTER TABLE "agency_api_keys" ADD CONSTRAINT "agency_api_keys_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agency_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "agency_sla_events" ("id" TEXT PRIMARY KEY,"clientId" TEXT NOT NULL,"findingId" TEXT NOT NULL,"priority" "Priority" NOT NULL,"openedAt" TIMESTAMP(3) NOT NULL,"dueAt" TIMESTAMP(3) NOT NULL,"resolvedAt" TIMESTAMP(3),"breached" BOOLEAN NOT NULL DEFAULT false);
CREATE UNIQUE INDEX "agency_sla_events_clientId_findingId_key" ON "agency_sla_events"("clientId","findingId");
CREATE INDEX "agency_sla_events_clientId_breached_dueAt_idx" ON "agency_sla_events"("clientId","breached","dueAt");
ALTER TABLE "agency_sla_events" ADD CONSTRAINT "agency_sla_events_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "agency_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "agency_activity" ("id" TEXT PRIMARY KEY,"agencyId" TEXT NOT NULL,"clientOrgId" TEXT,"actorId" TEXT NOT NULL,"type" TEXT NOT NULL,"message" TEXT NOT NULL,"detail" JSONB NOT NULL DEFAULT '{}',"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "agency_activity_agencyId_createdAt_idx" ON "agency_activity"("agencyId","createdAt");
CREATE INDEX "agency_activity_agencyId_clientOrgId_createdAt_idx" ON "agency_activity"("agencyId","clientOrgId","createdAt");
ALTER TABLE "agency_activity" ADD CONSTRAINT "agency_activity_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agency_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
