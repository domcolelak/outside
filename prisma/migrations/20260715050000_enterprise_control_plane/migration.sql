-- Enterprise features live in a dedicated control plane. Existing SMB and agency
-- tables are intentionally unchanged so enterprise capabilities can be enabled
-- per organization without altering the core product experience.

CREATE TABLE "enterprise_workspaces" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "licenseStatus" TEXT NOT NULL DEFAULT 'active',
    "licensedSeats" INTEGER NOT NULL DEFAULT 25,
    "features" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "dataRegion" TEXT NOT NULL DEFAULT 'eu',
    "retention" JSONB NOT NULL DEFAULT '{}'::JSONB,
    "provisioningMode" TEXT NOT NULL DEFAULT 'manual',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "enterprise_workspaces_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "enterprise_workspaces_license_check" CHECK ("licenseStatus" IN ('trial', 'active', 'suspended', 'expired')),
    CONSTRAINT "enterprise_workspaces_seats_check" CHECK ("licensedSeats" > 0),
    CONSTRAINT "enterprise_workspaces_region_check" CHECK ("dataRegion" IN ('eu', 'us', 'uk', 'ca', 'au', 'apac')),
    CONSTRAINT "enterprise_workspaces_provisioning_check" CHECK ("provisioningMode" IN ('manual', 'jit', 'scim'))
);

CREATE UNIQUE INDEX "enterprise_workspaces_orgId_key" ON "enterprise_workspaces"("orgId");
ALTER TABLE "enterprise_workspaces" ADD CONSTRAINT "enterprise_workspaces_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "enterprise_identity_providers" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "protocol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domains" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "enforceSso" BOOLEAN NOT NULL DEFAULT false,
    "jitProvisioning" BOOLEAN NOT NULL DEFAULT false,
    "configEncrypted" TEXT NOT NULL,
    "scimTokenHash" TEXT,
    "scimTokenPrefix" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "enterprise_identity_providers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "enterprise_identity_providers_protocol_check" CHECK ("protocol" IN ('oidc', 'saml'))
);
CREATE UNIQUE INDEX "enterprise_identity_providers_scimTokenHash_key" ON "enterprise_identity_providers"("scimTokenHash");
CREATE INDEX "enterprise_identity_providers_workspaceId_protocol_enabled_idx" ON "enterprise_identity_providers"("workspaceId", "protocol", "enabled");
ALTER TABLE "enterprise_identity_providers" ADD CONSTRAINT "enterprise_identity_providers_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "enterprise_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION outside_claim_enterprise_identity_domains()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('outside:enterprise:identity-domains'));
  IF EXISTS (
    SELECT 1 FROM enterprise_identity_providers existing
    WHERE existing.id <> NEW.id AND existing.domains && NEW.domains
  ) THEN
    RAISE EXCEPTION 'enterprise identity domain is already claimed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER enterprise_identity_domains_unique
BEFORE INSERT OR UPDATE OF domains ON "enterprise_identity_providers"
FOR EACH ROW EXECUTE FUNCTION outside_claim_enterprise_identity_domains();

CREATE TABLE "enterprise_roles" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "system" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "enterprise_roles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "enterprise_roles_workspaceId_name_key" ON "enterprise_roles"("workspaceId", "name");
ALTER TABLE "enterprise_roles" ADD CONSTRAINT "enterprise_roles_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "enterprise_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "enterprise_role_bindings" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "principalType" TEXT NOT NULL,
    "principalId" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL DEFAULT 'organization',
    "scopeId" TEXT,
    "conditions" JSONB NOT NULL DEFAULT '{}'::JSONB,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "enterprise_role_bindings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "enterprise_role_bindings_principal_check" CHECK ("principalType" IN ('user', 'group', 'service')),
    CONSTRAINT "enterprise_role_bindings_scope_check" CHECK ("scopeType" IN ('organization', 'department', 'asset', 'risk'))
);
CREATE UNIQUE INDEX "enterprise_role_bindings_unique" ON "enterprise_role_bindings"("workspaceId", "roleId", "principalType", "principalId", "scopeType", "scopeId") NULLS NOT DISTINCT;
CREATE INDEX "enterprise_role_bindings_workspace_principal_idx" ON "enterprise_role_bindings"("workspaceId", "principalType", "principalId");
ALTER TABLE "enterprise_role_bindings" ADD CONSTRAINT "enterprise_role_bindings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "enterprise_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "enterprise_role_bindings" ADD CONSTRAINT "enterprise_role_bindings_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "enterprise_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "enterprise_org_units" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "parentId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'department',
    "name" TEXT NOT NULL,
    "externalId" TEXT,
    "managerId" TEXT,
    "path" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}'::JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "enterprise_org_units_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "enterprise_org_units_kind_check" CHECK ("kind" IN ('organization', 'business_unit', 'department', 'team'))
);
CREATE UNIQUE INDEX "enterprise_org_units_workspaceId_path_key" ON "enterprise_org_units"("workspaceId", "path");
CREATE INDEX "enterprise_org_units_workspaceId_parentId_idx" ON "enterprise_org_units"("workspaceId", "parentId");
ALTER TABLE "enterprise_org_units" ADD CONSTRAINT "enterprise_org_units_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "enterprise_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "enterprise_org_units" ADD CONSTRAINT "enterprise_org_units_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "enterprise_org_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "enterprise_ownership" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'accountable',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "enterprise_ownership_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "enterprise_ownership_subject_check" CHECK ("subjectType" IN ('asset', 'risk', 'finding', 'target')),
    CONSTRAINT "enterprise_ownership_owner_check" CHECK ("ownerType" IN ('user', 'group', 'department')),
    CONSTRAINT "enterprise_ownership_role_check" CHECK ("role" IN ('accountable', 'responsible', 'consulted', 'informed'))
);
CREATE UNIQUE INDEX "enterprise_ownership_unique" ON "enterprise_ownership"("workspaceId", "subjectType", "subjectId", "ownerType", "ownerId", "role");
CREATE INDEX "enterprise_ownership_workspace_subject_idx" ON "enterprise_ownership"("workspaceId", "subjectType", "subjectId");
ALTER TABLE "enterprise_ownership" ADD CONSTRAINT "enterprise_ownership_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "enterprise_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "enterprise_policies" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "document" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "enterprise_policies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "enterprise_policies_kind_check" CHECK ("kind" IN ('governance', 'scoring', 'notification', 'retention', 'approval')),
    CONSTRAINT "enterprise_policies_version_check" CHECK ("version" > 0)
);
CREATE UNIQUE INDEX "enterprise_policies_workspaceId_kind_name_key" ON "enterprise_policies"("workspaceId", "kind", "name");
CREATE INDEX "enterprise_policies_workspace_enabled_kind_idx" ON "enterprise_policies"("workspaceId", "enabled", "kind");
ALTER TABLE "enterprise_policies" ADD CONSTRAINT "enterprise_policies_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "enterprise_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "enterprise_approvals" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "workflow" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestedBy" TEXT NOT NULL,
    "approverIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "decidedBy" TEXT,
    "decisionNote" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}'::JSONB,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    CONSTRAINT "enterprise_approvals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "enterprise_approvals_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected', 'cancelled', 'expired'))
);
CREATE INDEX "enterprise_approvals_workspace_status_created_idx" ON "enterprise_approvals"("workspaceId", "status", "createdAt");
ALTER TABLE "enterprise_approvals" ADD CONSTRAINT "enterprise_approvals_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "enterprise_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "enterprise_risk_exceptions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "policyId" TEXT,
    "reason" TEXT NOT NULL,
    "compensatingControls" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestedBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "enterprise_risk_exceptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "enterprise_risk_exceptions_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected', 'expired', 'revoked'))
);
CREATE INDEX "enterprise_risk_exceptions_workspace_status_expiry_idx" ON "enterprise_risk_exceptions"("workspaceId", "status", "expiresAt");
ALTER TABLE "enterprise_risk_exceptions" ADD CONSTRAINT "enterprise_risk_exceptions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "enterprise_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "enterprise_risk_exceptions" ADD CONSTRAINT "enterprise_risk_exceptions_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "enterprise_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "enterprise_api_tokens" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "scopes" JSONB NOT NULL DEFAULT '{}'::JSONB,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "enterprise_api_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "enterprise_api_tokens_secretHash_key" ON "enterprise_api_tokens"("secretHash");
CREATE INDEX "enterprise_api_tokens_workspace_revoked_expiry_idx" ON "enterprise_api_tokens"("workspaceId", "revokedAt", "expiresAt");
ALTER TABLE "enterprise_api_tokens" ADD CONSTRAINT "enterprise_api_tokens_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "enterprise_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "enterprise_integrations" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "configEncrypted" TEXT NOT NULL,
    "eventTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "severities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'configured',
    "lastDeliveryAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "enterprise_integrations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "enterprise_integrations_category_check" CHECK ("category" IN ('siem', 'soar', 'ticketing', 'webhook', 'export'))
);
CREATE INDEX "enterprise_integrations_workspace_category_enabled_idx" ON "enterprise_integrations"("workspaceId", "category", "enabled");
ALTER TABLE "enterprise_integrations" ADD CONSTRAINT "enterprise_integrations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "enterprise_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "enterprise_deliveries" (
    "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "integrationId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL, "eventId" TEXT NOT NULL, "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending', "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "leaseId" TEXT,
    "leasedUntil" TIMESTAMP(3), "lastError" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3), CONSTRAINT "enterprise_deliveries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "enterprise_deliveries_status_check" CHECK ("status" IN ('pending', 'processing', 'delivered', 'dead_letter'))
);
CREATE UNIQUE INDEX "enterprise_deliveries_idempotencyKey_key" ON "enterprise_deliveries"("idempotencyKey");
CREATE INDEX "enterprise_deliveries_status_next_lease_idx" ON "enterprise_deliveries"("status", "nextAttemptAt", "leasedUntil");
CREATE INDEX "enterprise_deliveries_workspace_created_idx" ON "enterprise_deliveries"("workspaceId", "createdAt");
ALTER TABLE "enterprise_deliveries" ADD CONSTRAINT "enterprise_deliveries_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "enterprise_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "enterprise_deliveries" ADD CONSTRAINT "enterprise_deliveries_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "enterprise_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "enterprise_ticket_links" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "externalUrl" TEXT,
    "status" TEXT NOT NULL,
    "syncVersion" INTEGER NOT NULL DEFAULT 1,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL DEFAULT '{}'::JSONB,
    CONSTRAINT "enterprise_ticket_links_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "enterprise_ticket_links_workspace_provider_finding_key" ON "enterprise_ticket_links"("workspaceId", "provider", "findingId");
CREATE INDEX "enterprise_ticket_links_workspace_provider_external_idx" ON "enterprise_ticket_links"("workspaceId", "provider", "externalId");
ALTER TABLE "enterprise_ticket_links" ADD CONSTRAINT "enterprise_ticket_links_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "enterprise_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "enterprise_exports" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "schedule" TEXT,
    "destinationIntegrationId" TEXT,
    "filters" JSONB NOT NULL DEFAULT '{}'::JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "enterprise_exports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "enterprise_exports_format_check" CHECK ("format" IN ('json', 'csv', 'ndjson', 'cef', 'leef', 'pdf'))
);
CREATE INDEX "enterprise_exports_workspace_enabled_nextRun_idx" ON "enterprise_exports"("workspaceId", "enabled", "nextRunAt");
ALTER TABLE "enterprise_exports" ADD CONSTRAINT "enterprise_exports_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "enterprise_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "enterprise_exports" ADD CONSTRAINT "enterprise_exports_destination_fkey" FOREIGN KEY ("destinationIntegrationId") REFERENCES "enterprise_integrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "enterprise_feature_flags" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "rollout" INTEGER NOT NULL DEFAULT 100,
    "rules" JSONB NOT NULL DEFAULT '{}'::JSONB,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "enterprise_feature_flags_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "enterprise_feature_flags_rollout_check" CHECK ("rollout" BETWEEN 0 AND 100)
);
CREATE UNIQUE INDEX "enterprise_feature_flags_workspaceId_key_key" ON "enterprise_feature_flags"("workspaceId", "key");
ALTER TABLE "enterprise_feature_flags" ADD CONSTRAINT "enterprise_feature_flags_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "enterprise_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "enterprise_directory_users" (
    "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "identityProviderId" TEXT NOT NULL, "userId" TEXT, "externalId" TEXT,
    "userName" TEXT NOT NULL, "displayName" TEXT NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true,
    "departmentId" TEXT, "attributes" JSONB NOT NULL DEFAULT '{}'::JSONB,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "enterprise_directory_users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "enterprise_directory_users_workspace_userName_key" ON "enterprise_directory_users"("workspaceId", "userName");
CREATE UNIQUE INDEX "enterprise_directory_users_provider_externalId_key" ON "enterprise_directory_users"("identityProviderId", "externalId");
CREATE INDEX "enterprise_directory_users_workspace_user_idx" ON "enterprise_directory_users"("workspaceId", "userId");
CREATE INDEX "enterprise_directory_users_workspace_identity_provider_idx" ON "enterprise_directory_users"("workspaceId", "identityProviderId");
ALTER TABLE "enterprise_directory_users" ADD CONSTRAINT "enterprise_directory_users_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "enterprise_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "enterprise_directory_users" ADD CONSTRAINT "enterprise_directory_users_identityProviderId_fkey" FOREIGN KEY ("identityProviderId") REFERENCES "enterprise_identity_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "enterprise_directory_groups" (
    "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "identityProviderId" TEXT NOT NULL, "externalId" TEXT,
    "displayName" TEXT NOT NULL, "memberIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "attributes" JSONB NOT NULL DEFAULT '{}'::JSONB, "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "enterprise_directory_groups_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "enterprise_directory_groups_provider_name_key" ON "enterprise_directory_groups"("identityProviderId", "displayName");
CREATE UNIQUE INDEX "enterprise_directory_groups_provider_externalId_key" ON "enterprise_directory_groups"("identityProviderId", "externalId");
CREATE INDEX "enterprise_directory_groups_workspace_identity_provider_idx" ON "enterprise_directory_groups"("workspaceId", "identityProviderId");
ALTER TABLE "enterprise_directory_groups" ADD CONSTRAINT "enterprise_directory_groups_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "enterprise_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "enterprise_directory_groups" ADD CONSTRAINT "enterprise_directory_groups_identityProviderId_fkey" FOREIGN KEY ("identityProviderId") REFERENCES "enterprise_identity_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "memberships" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "memberships" ADD COLUMN "provisionedBy" TEXT;

CREATE TABLE "enterprise_audit_events" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sequence" BIGINT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "requestId" TEXT,
    "ipHash" TEXT,
    "detail" JSONB NOT NULL DEFAULT '{}'::JSONB,
    "previousHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "enterprise_audit_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "enterprise_audit_events_workspaceId_sequence_key" ON "enterprise_audit_events"("workspaceId", "sequence");
CREATE INDEX "enterprise_audit_events_workspaceId_createdAt_idx" ON "enterprise_audit_events"("workspaceId", "createdAt");
ALTER TABLE "enterprise_audit_events" ADD CONSTRAINT "enterprise_audit_events_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "enterprise_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The application hash-chain makes tampering detectable. The database trigger
-- makes persisted audit rows append-only, including for application roles with
-- ordinary table write access.
CREATE OR REPLACE FUNCTION outside_prevent_enterprise_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'enterprise audit events are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enterprise_audit_events_immutable
BEFORE UPDATE OR DELETE ON "enterprise_audit_events"
FOR EACH ROW EXECUTE FUNCTION outside_prevent_enterprise_audit_mutation();
