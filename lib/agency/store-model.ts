import type { AgencyActivity, AgencyApiKey, AgencyBulkJob, AgencyClient, AgencyFindingShare, AgencyGroup, AgencyInvite, AgencyMembership, AgencyNote, AgencyReport, AgencyRole, AgencyWorkspace } from "./types";

export interface AgencyStore {
  readonly durable: boolean;
  workspaceForUser(userId: string): Promise<{ workspace: AgencyWorkspace; membership: AgencyMembership } | null>;
  membershipForUser(agencyId: string, userId: string): Promise<AgencyMembership | null>;
  workspace(id: string): Promise<AgencyWorkspace | null>;
  createWorkspace(input: { ownerOrgId: string; ownerUserId: string; name: string; slug: string }): Promise<AgencyWorkspace>;
  updateWorkspace(id: string, patch: Partial<Pick<AgencyWorkspace, "name" | "consultantMode" | "resellerParentId">> & { branding?: Partial<AgencyWorkspace["branding"]> }): Promise<AgencyWorkspace | null>;
  memberships(agencyId: string): Promise<AgencyMembership[]>;
  upsertMembership(input: { agencyId: string; userId: string; role: AgencyRole; seatLabel?: string | null }): Promise<AgencyMembership>;
  updateMembership(agencyId: string, userId: string, patch: { role?: AgencyRole; active?: boolean; seatLabel?: string | null }): Promise<AgencyMembership | null>;
  clients(agencyId: string): Promise<AgencyClient[]>;
  addClient(input: { agencyId: string; orgId: string; organizationName: string; organizationSlug: string; groupId?: string | null; externalRef?: string | null }): Promise<AgencyClient | null>;
  updateClient(agencyId: string, clientId: string, patch: Partial<Pick<AgencyClient, "groupId" | "status" | "portalMode" | "externalRef" | "serviceTier" | "slaResponseMinutes" | "notificationRouting" | "billingMode" | "monthlyPriceCents" | "currency">>): Promise<AgencyClient | null>;
  groups(agencyId: string): Promise<AgencyGroup[]>;
  createGroup(input: { agencyId: string; name: string; color: string; description?: string | null }): Promise<AgencyGroup | null>;
  notes(agencyId: string, clientId: string): Promise<AgencyNote[]>;
  createNote(input: { agencyId: string; clientId: string; authorId: string; body: string; visibility: "internal" | "shared" }): Promise<AgencyNote>;
  shareFinding(input: { agencyId: string; clientId: string; recommendationId: string; sharedBy: string; clientMessage?: string | null }): Promise<AgencyFindingShare>;
  findingShares(agencyId: string, clientId: string): Promise<AgencyFindingShare[]>;
  createJob(input: { agencyId: string; type: "scan" | "report" | "digest"; idempotencyKey: string; clientOrgIds: string[]; payload: Record<string, unknown>; createdBy: string }): Promise<AgencyBulkJob>;
  jobs(agencyId: string, limit?: number): Promise<AgencyBulkJob[]>;
  finishJob(agencyId: string, id: string, status: "completed" | "partially_failed" | "failed", result: unknown): Promise<AgencyBulkJob | null>;
  appendActivity(input: Omit<AgencyActivity, "id" | "createdAt">): Promise<AgencyActivity>;
  activity(agencyId: string, limit?: number): Promise<AgencyActivity[]>;
  createApiKey(input: { agencyId: string; name: string; prefix: string; secretHash: string; scopes: string[]; createdBy: string; expiresAt?: string | null }): Promise<AgencyApiKey>;
  apiKeys(agencyId: string): Promise<AgencyApiKey[]>;
  authenticateApiKey(secretHash: string, now: Date): Promise<AgencyApiKey | null>;
  revokeApiKey(agencyId: string, id: string): Promise<boolean>;
  createInvite(input: { agencyId: string; email: string; role: AgencyRole; kind: "seat" | "client_portal"; clientId?: string | null; tokenHash: string; createdBy: string; expiresAt: string }): Promise<AgencyInvite>;
  invites(agencyId: string): Promise<AgencyInvite[]>;
  acceptInvite(tokenHash: string, userId: string, email: string, now: Date): Promise<AgencyInvite | null>;
  hasPortalInvite(agencyId: string, clientId: string, userId: string): Promise<boolean>;
  createReport(input: { agencyId: string; clientOrgId?: string | null; periodStart: string; periodEnd: string; kind: AgencyReport["kind"]; title: string; content: Record<string, unknown>; branding: AgencyWorkspace["branding"]; createdBy: string }): Promise<AgencyReport>;
  reports(agencyId: string, limit?: number): Promise<AgencyReport[]>;
}
