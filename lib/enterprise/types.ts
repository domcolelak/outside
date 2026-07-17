export const ENTERPRISE_FEATURES = [
  "sso", "scim", "advanced_rbac", "audit_exports", "hierarchy", "ownership",
  "governance", "api", "integrations", "reporting", "data_controls",
] as const;
export type EnterpriseFeature = typeof ENTERPRISE_FEATURES[number];

export const ENTERPRISE_PERMISSIONS = [
  "enterprise:read", "identity:manage", "scim:manage", "roles:manage",
  "hierarchy:manage", "ownership:manage", "policies:manage", "approvals:request",
  "approvals:decide", "exceptions:manage", "audit:read", "audit:export",
  "tokens:manage", "integrations:manage", "tickets:manage", "reports:manage",
  "retention:manage", "license:manage", "flags:manage", "assets:read", "findings:read",
] as const;
export type EnterprisePermission = typeof ENTERPRISE_PERMISSIONS[number];

export type DataRegion = "eu" | "us" | "uk" | "ca" | "au" | "apac";
export type LicenseStatus = "trial" | "active" | "suspended" | "expired";
export type IdentityProtocol = "oidc" | "saml";
export type EnterpriseResourceKind = "identityProviders" | "directoryUsers" | "directoryGroups" | "roles" | "bindings" | "units" | "ownership" | "policies" | "approvals" | "exceptions" | "apiTokens" | "integrations" | "deliveries" | "tickets" | "exports" | "flags";

export interface EnterpriseWorkspace {
  id: string; orgId: string; licenseStatus: LicenseStatus; licensedSeats: number;
  features: EnterpriseFeature[]; dataRegion: DataRegion; retention: Record<string, number>;
  provisioningMode: "manual" | "jit" | "scim"; expiresAt: string | null;
  createdAt: string; updatedAt: string;
}

export interface EnterpriseRecord {
  id: string; workspaceId: string; createdAt?: string; updatedAt?: string;
  [key: string]: unknown;
}

export interface EnterpriseIdentityProvider extends EnterpriseRecord {
  protocol: IdentityProtocol; name: string; domains: string[]; enabled: boolean;
  enforceSso: boolean; jitProvisioning: boolean; configEncrypted: string;
  scimTokenHash: string | null; scimTokenPrefix: string | null; lastSyncAt: string | null;
}
export interface EnterpriseDirectoryUser extends EnterpriseRecord { identityProviderId: string; userId: string | null; externalId: string | null; userName: string; displayName: string; active: boolean; departmentId: string | null; attributes: Record<string, unknown>; lastSyncedAt: string; }
export interface EnterpriseDirectoryGroup extends EnterpriseRecord { identityProviderId: string; externalId: string | null; displayName: string; memberIds: string[]; attributes: Record<string, unknown>; lastSyncedAt: string; }
export interface EnterpriseRole extends EnterpriseRecord { name: string; description: string | null; permissions: EnterprisePermission[]; system: boolean; }
export interface EnterpriseRoleBinding extends EnterpriseRecord { roleId: string; principalType: "user" | "group" | "service"; principalId: string; scopeType: "organization" | "department" | "asset" | "risk"; scopeId: string | null; conditions: Record<string, unknown>; createdBy: string; }
export interface EnterpriseOrgUnit extends EnterpriseRecord { parentId: string | null; kind: "organization" | "business_unit" | "department" | "team"; name: string; externalId: string | null; managerId: string | null; path: string; metadata: Record<string, unknown>; }
export interface EnterpriseOwnership extends EnterpriseRecord { subjectType: "asset" | "risk" | "finding" | "target"; subjectId: string; ownerType: "user" | "group" | "department"; ownerId: string; role: "accountable" | "responsible" | "consulted" | "informed"; source: string; createdBy: string; }
export interface EnterprisePolicy extends EnterpriseRecord { kind: "governance" | "scoring" | "notification" | "retention" | "approval"; name: string; description: string | null; enabled: boolean; version: number; document: Record<string, unknown>; createdBy: string; }
export interface EnterpriseApproval extends EnterpriseRecord { workflow: string; subjectType: string; subjectId: string; status: "pending" | "approved" | "rejected" | "cancelled" | "expired"; requestedBy: string; approverIds: string[]; decidedBy: string | null; decisionNote: string | null; payload: Record<string, unknown>; expiresAt: string | null; decidedAt: string | null; }
export interface EnterpriseRiskException extends EnterpriseRecord { subjectType: string; subjectId: string; policyId: string | null; reason: string; compensatingControls: string | null; status: "pending" | "approved" | "rejected" | "expired" | "revoked"; requestedBy: string; approvedBy: string | null; expiresAt: string; }
export interface EnterpriseApiToken extends EnterpriseRecord { name: string; prefix: string; secretHash: string; permissions: EnterprisePermission[]; scopes: Record<string, string[]>; createdBy: string; expiresAt: string | null; lastUsedAt: string | null; revokedAt: string | null; }
export type IntegrationCategory = "siem" | "soar" | "ticketing" | "webhook" | "export";
export interface EnterpriseIntegration extends EnterpriseRecord { provider: string; category: IntegrationCategory; name: string; enabled: boolean; configEncrypted: string; eventTypes: string[]; severities: string[]; status: string; lastDeliveryAt: string | null; lastError: string | null; createdBy: string; }
export interface EnterpriseDelivery extends EnterpriseRecord { integrationId: string; idempotencyKey: string; eventId: string; payload: Record<string, unknown>; status: "pending" | "processing" | "delivered" | "dead_letter"; attempts: number; nextAttemptAt: string; leaseId: string | null; leasedUntil: string | null; lastError: string | null; deliveredAt: string | null; }
export interface EnterpriseTicketLink extends EnterpriseRecord { provider: string; findingId: string; externalId: string; externalUrl: string | null; status: string; syncVersion: number; lastSyncedAt: string; metadata: Record<string, unknown>; }
export interface EnterpriseExport extends EnterpriseRecord { name: string; kind: string; format: "json" | "csv" | "ndjson" | "cef" | "leef" | "pdf"; schedule: string | null; destinationIntegrationId: string | null; filters: Record<string, unknown>; enabled: boolean; nextRunAt: string | null; lastRunAt: string | null; lastStatus: string | null; createdBy: string; }
export interface EnterpriseFeatureFlag extends EnterpriseRecord { key: string; enabled: boolean; rollout: number; rules: Record<string, unknown>; updatedBy: string; }
export interface EnterpriseAuditEvent extends EnterpriseRecord { sequence: string; actorType: "user" | "api_token" | "scim" | "system"; actorId: string; action: string; resourceType: string; resourceId: string | null; requestId: string | null; ipHash: string | null; detail: Record<string, unknown>; previousHash: string; hash: string; createdAt: string; }

export interface EnterpriseOverview {
  workspace: EnterpriseWorkspace;
  counts: Record<EnterpriseResourceKind | "audit", number>;
  identityProviders: Array<Pick<EnterpriseIdentityProvider, "id" | "workspaceId" | "protocol" | "name" | "domains" | "enabled" | "enforceSso" | "jitProvisioning" | "scimTokenPrefix" | "lastSyncAt" | "createdAt" | "updatedAt">>;
  pendingApprovals: EnterpriseApproval[];
  expiringExceptions: EnterpriseRiskException[];
  integrations: Array<Pick<EnterpriseIntegration, "id" | "workspaceId" | "provider" | "category" | "name" | "enabled" | "eventTypes" | "severities" | "status" | "lastDeliveryAt" | "lastError" | "createdBy" | "createdAt" | "updatedAt">>;
  flags: EnterpriseFeatureFlag[];
  auditHead: { sequence: string; hash: string } | null;
}

export const SYSTEM_ROLES: Array<Omit<EnterpriseRole, "id" | "workspaceId" | "createdAt" | "updatedAt">> = [
  { name: "Enterprise Owner", description: "Unrestricted enterprise control-plane access.", permissions: [...ENTERPRISE_PERMISSIONS], system: true },
  { name: "Security Administrator", description: "Security governance, integrations, ownership and reporting.", permissions: ["enterprise:read", "hierarchy:manage", "ownership:manage", "policies:manage", "approvals:request", "approvals:decide", "exceptions:manage", "audit:read", "integrations:manage", "tickets:manage", "reports:manage", "assets:read", "findings:read"], system: true },
  { name: "Identity Administrator", description: "SSO, SCIM and role administration.", permissions: ["enterprise:read", "identity:manage", "scim:manage", "roles:manage", "hierarchy:manage", "audit:read"], system: true },
  { name: "Risk Manager", description: "Risk ownership, policy and exception workflow.", permissions: ["enterprise:read", "ownership:manage", "policies:manage", "approvals:request", "approvals:decide", "exceptions:manage", "audit:read", "reports:manage", "assets:read", "findings:read"], system: true },
  { name: "Compliance Auditor", description: "Read-only evidence, audit and compliance export access.", permissions: ["enterprise:read", "audit:read", "audit:export", "reports:manage", "assets:read", "findings:read"], system: true },
  { name: "Enterprise Viewer", description: "Read-only enterprise posture access.", permissions: ["enterprise:read", "assets:read", "findings:read"], system: true },
];
