import type { GuardianEvent, GuardianRecommendation } from "@/lib/guardian/types";

export type AgencyRole = "owner" | "admin" | "manager" | "analyst" | "billing" | "viewer";
export type AgencyPermission =
  | "agency:read" | "agency:manage" | "clients:read" | "clients:manage"
  | "findings:share" | "notes:write" | "operations:run" | "reports:generate"
  | "billing:manage" | "seats:manage" | "api:manage";
export type AgencyClientStatus = "onboarding" | "active" | "paused" | "offboarded";
export type AgencyPortalMode = "disabled" | "readonly" | "collaborative";

const PERMISSIONS: Record<AgencyRole, readonly AgencyPermission[]> = {
  owner: ["agency:read", "agency:manage", "clients:read", "clients:manage", "findings:share", "notes:write", "operations:run", "reports:generate", "billing:manage", "seats:manage", "api:manage"],
  admin: ["agency:read", "agency:manage", "clients:read", "clients:manage", "findings:share", "notes:write", "operations:run", "reports:generate", "billing:manage", "seats:manage", "api:manage"],
  manager: ["agency:read", "clients:read", "clients:manage", "findings:share", "notes:write", "operations:run", "reports:generate"],
  analyst: ["agency:read", "clients:read", "findings:share", "notes:write", "operations:run", "reports:generate"],
  billing: ["agency:read", "clients:read", "billing:manage"],
  viewer: ["agency:read", "clients:read"],
};

export function hasAgencyPermission(role: AgencyRole, permission: AgencyPermission): boolean {
  return PERMISSIONS[role].includes(permission);
}

export interface AgencyBranding {
  whiteLabel: boolean;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  supportEmail: string | null;
  customDomain: string | null;
  emailFromName: string | null;
  emailFooter: string | null;
}

export interface AgencyWorkspace {
  id: string; ownerOrgId: string; name: string; slug: string; consultantMode: boolean;
  resellerParentId: string | null; branding: AgencyBranding; createdAt: string; updatedAt: string;
}

export interface AgencyMembership { agencyId: string; userId: string; role: AgencyRole; seatLabel: string | null; active: boolean; createdAt: string; }
export interface AgencyGroup { id: string; agencyId: string; name: string; color: string; description: string | null; createdAt: string; }
export interface AgencyClient {
  id: string; agencyId: string; orgId: string; organizationName: string; organizationSlug: string;
  groupId: string | null; status: AgencyClientStatus; portalMode: AgencyPortalMode; externalRef: string | null;
  serviceTier: string; slaResponseMinutes: number; notificationRouting: Record<string, unknown>;
  billingMode: string; monthlyPriceCents: number | null; currency: string; addedAt: string; offboardedAt: string | null;
}
export interface AgencyNote { id: string; agencyId: string; clientId: string; authorId: string; body: string; visibility: "internal" | "shared"; createdAt: string; updatedAt: string; }
export interface AgencyFindingShare { id: string; agencyId: string; clientId: string; recommendationId: string; sharedBy: string; clientMessage: string | null; status: string; sharedAt: string; }
export interface AgencyBulkJob { id: string; agencyId: string; type: "scan" | "report" | "digest"; status: string; idempotencyKey: string; clientOrgIds: string[]; payload: Record<string, unknown>; result: unknown; createdBy: string; createdAt: string; }
export interface AgencyActivity { id: string; agencyId: string; clientOrgId: string | null; actorId: string; type: string; message: string; detail: Record<string, unknown>; createdAt: string; }
export interface AgencyApiKey { id: string; agencyId: string; name: string; prefix: string; scopes: string[]; createdBy: string; createdAt: string; lastUsedAt: string | null; expiresAt: string | null; revokedAt: string | null; }
export interface AgencyInvite { id: string; agencyId: string; email: string; role: AgencyRole; kind: "seat" | "client_portal"; clientId: string | null; createdBy: string; createdAt: string; expiresAt: string; acceptedAt: string | null; acceptedBy: string | null; revokedAt: string | null; }
export interface AgencyReport { id: string; agencyId: string; clientOrgId: string | null; periodStart: string; periodEnd: string; kind: "client" | "portfolio" | "executive"; status: string; title: string; content: Record<string, unknown>; branding: AgencyBranding; createdBy: string; createdAt: string; }
export interface AgencySlaEvent { id: string; clientId: string; findingId: string; priority: "critical" | "high" | "medium" | "low" | "info"; openedAt: string; dueAt: string; resolvedAt: string | null; breached: boolean; status: "open" | "acknowledged" | "resolved"; acknowledgedAt: string | null; acknowledgedBy: string | null; lastObservedAt: string; escalatedAt: string | null; }
export interface AgencyNotificationRouting { emails: string[]; channelIds: string[]; severities: Array<"critical" | "high" | "medium" | "low" | "info">; }

export interface PortfolioClientHealth {
  client: AgencyClient; exposureScore: number | null; health: "healthy" | "watch" | "at_risk" | "unknown";
  assets: number; critical: number; high: number; openRecommendations: number; shadowAssets: number;
  slaBreaches: number; lastObservedAt: string | null;
}
export interface PortfolioOverview {
  workspace: AgencyWorkspace; role: AgencyRole; clients: PortfolioClientHealth[]; groups: AgencyGroup[];
  portfolioScore: number | null; healthyClients: number; atRiskClients: number; unknownClients: number;
  totalAssets: number; criticalFindings: number; openRecommendations: number; slaBreaches: number;
  recentChanges: Array<GuardianEvent & { clientOrgId: string; clientName: string }>;
  topRecommendations: Array<GuardianRecommendation & { clientOrgId: string; clientName: string }>;
  activity: AgencyActivity[]; durable: boolean; generatedAt: string;
}
