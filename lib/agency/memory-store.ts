import { randomUUID } from "node:crypto";
import type { AgencyStore } from "./store-model";
import type { AgencyActivity, AgencyApiKey, AgencyBulkJob, AgencyClient, AgencyFindingShare, AgencyGroup, AgencyInvite, AgencyMembership, AgencyNote, AgencyReport, AgencyWorkspace } from "./types";

const id = (prefix: string) => `${prefix}_${randomUUID()}`;
const now = () => new Date().toISOString();

export class InMemoryAgencyStore implements AgencyStore {
  readonly durable = false;
  private workspaces: AgencyWorkspace[] = [];
  private members: AgencyMembership[] = [];
  private clientRows: AgencyClient[] = [];
  private groupRows: AgencyGroup[] = [];
  private noteRows: AgencyNote[] = [];
  private shares: AgencyFindingShare[] = [];
  private jobRows: AgencyBulkJob[] = [];
  private activities: AgencyActivity[] = [];
  private keyRows: Array<AgencyApiKey & { secretHash: string }> = [];
  private inviteRows: Array<AgencyInvite & { tokenHash: string }> = [];
  private reportRows: AgencyReport[] = [];

  async workspaceForUser(userId: string) {
    const membership = this.members.find((item) => item.userId === userId && item.active);
    const workspace = membership && this.workspaces.find((item) => item.id === membership.agencyId);
    return membership && workspace ? { workspace, membership } : null;
  }
  async membershipForUser(agencyId: string, userId: string) { return this.members.find((item) => item.agencyId === agencyId && item.userId === userId && item.active) ?? null; }
  async workspace(idValue: string) { return this.workspaces.find((item) => item.id === idValue) ?? null; }
  async createWorkspace(input: { ownerOrgId: string; ownerUserId: string; name: string; slug: string }) {
    if (this.workspaces.some((item) => item.ownerOrgId === input.ownerOrgId || item.slug === input.slug)) throw new Error("Agency workspace already exists");
    const timestamp = now();
    const workspace: AgencyWorkspace = { id: id("agency"), ownerOrgId: input.ownerOrgId, name: input.name, slug: input.slug, consultantMode: true, resellerParentId: null, branding: { whiteLabel: false, logoUrl: null, primaryColor: "#38e1c3", accentColor: "#5b8cff", supportEmail: null, customDomain: null, emailFromName: null, emailFooter: null }, createdAt: timestamp, updatedAt: timestamp };
    this.workspaces.push(workspace);
    this.members.push({ agencyId: workspace.id, userId: input.ownerUserId, role: "owner", seatLabel: "Principal", active: true, createdAt: timestamp });
    return workspace;
  }
  async updateWorkspace(idValue: string, patch: Partial<Pick<AgencyWorkspace, "name" | "consultantMode" | "resellerParentId">> & { branding?: Partial<AgencyWorkspace["branding"]> }) {
    const row = this.workspaces.find((item) => item.id === idValue);
    if (!row) return null;
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.consultantMode !== undefined) row.consultantMode = patch.consultantMode;
    if (patch.resellerParentId !== undefined) row.resellerParentId = patch.resellerParentId;
    if (patch.branding) row.branding = { ...row.branding, ...patch.branding };
    row.updatedAt = now();
    return row;
  }
  async memberships(agencyId: string) { return this.members.filter((item) => item.agencyId === agencyId); }
  async upsertMembership(input: { agencyId: string; userId: string; role: AgencyMembership["role"]; seatLabel?: string | null }) {
    let row = this.members.find((item) => item.agencyId === input.agencyId && item.userId === input.userId);
    if (row) { row.role = input.role; row.seatLabel = input.seatLabel ?? row.seatLabel; row.active = true; return row; }
    row = { ...input, seatLabel: input.seatLabel ?? null, active: true, createdAt: now() };
    this.members.push(row); return row;
  }
  async updateMembership(agencyId: string, userId: string, patch: { role?: AgencyMembership["role"]; active?: boolean; seatLabel?: string | null }) { const row = this.members.find((item) => item.agencyId === agencyId && item.userId === userId); if (!row) return null; if (patch.role !== undefined) row.role = patch.role; if (patch.active !== undefined) row.active = patch.active; if (patch.seatLabel !== undefined) row.seatLabel = patch.seatLabel; return row; }
  async clients(agencyId: string) { return this.clientRows.filter((item) => item.agencyId === agencyId && item.status !== "offboarded"); }
  async addClient(input: { agencyId: string; orgId: string; organizationName: string; organizationSlug: string; groupId?: string | null; externalRef?: string | null }) {
    if (this.clientRows.some((item) => item.agencyId === input.agencyId && item.orgId === input.orgId)) return null;
    const row: AgencyClient = { id: id("client"), agencyId: input.agencyId, orgId: input.orgId, organizationName: input.organizationName, organizationSlug: input.organizationSlug, groupId: input.groupId ?? null, status: "onboarding", portalMode: "readonly", externalRef: input.externalRef ?? null, serviceTier: "standard", slaResponseMinutes: 480, notificationRouting: {}, billingMode: "agency", monthlyPriceCents: null, currency: "EUR", addedAt: now(), offboardedAt: null };
    this.clientRows.push(row); return row;
  }
  async updateClient(agencyId: string, clientId: string, patch: Partial<AgencyClient>) {
    const row = this.clientRows.find((item) => item.agencyId === agencyId && item.id === clientId);
    if (!row) return null;
    Object.assign(row, patch);
    row.slaResponseMinutes = Math.max(15, Math.min(43_200, row.slaResponseMinutes));
    row.offboardedAt = row.status === "offboarded" ? row.offboardedAt ?? now() : null;
    return row;
  }
  async groups(agencyId: string) { return this.groupRows.filter((item) => item.agencyId === agencyId); }
  async createGroup(input: { agencyId: string; name: string; color: string; description?: string | null }) {
    if (this.groupRows.some((item) => item.agencyId === input.agencyId && item.name.toLowerCase() === input.name.toLowerCase())) return null;
    const row = { id: id("group"), agencyId: input.agencyId, name: input.name, color: input.color, description: input.description ?? null, createdAt: now() };
    this.groupRows.push(row); return row;
  }
  async notes(agencyId: string, clientId: string) { return this.noteRows.filter((item) => item.agencyId === agencyId && item.clientId === clientId).sort((a,b) => b.createdAt.localeCompare(a.createdAt)); }
  async createNote(input: { agencyId: string; clientId: string; authorId: string; body: string; visibility: "internal" | "shared" }) {
    const timestamp = now(); const row = { id: id("note"), ...input, createdAt: timestamp, updatedAt: timestamp };
    this.noteRows.push(row); return row;
  }
  async shareFinding(input: { agencyId: string; clientId: string; recommendationId: string; sharedBy: string; clientMessage?: string | null }) {
    const existing = this.shares.find((item) => item.agencyId === input.agencyId && item.clientId === input.clientId && item.recommendationId === input.recommendationId);
    if (existing) { existing.clientMessage = input.clientMessage ?? existing.clientMessage; existing.status = "shared"; return existing; }
    const row = { id: id("share"), ...input, clientMessage: input.clientMessage ?? null, status: "shared", sharedAt: now() };
    this.shares.push(row); return row;
  }
  async findingShares(agencyId: string, clientId: string) { return this.shares.filter((item) => item.agencyId === agencyId && item.clientId === clientId); }
  async createJob(input: { agencyId: string; type: AgencyBulkJob["type"]; idempotencyKey: string; clientOrgIds: string[]; payload: Record<string, unknown>; createdBy: string }) {
    const existing = this.jobRows.find((item) => item.idempotencyKey === input.idempotencyKey);
    if (existing) return existing;
    const row: AgencyBulkJob = { id: id("job"), ...input, status: "queued", result: null, createdAt: now() };
    this.jobRows.push(row); return row;
  }
  async jobs(agencyId: string, limit = 50) { return this.jobRows.filter((item) => item.agencyId === agencyId).sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit); }
  async finishJob(agencyId: string, jobId: string, status: "completed" | "partially_failed" | "failed", result: unknown) { const row = this.jobRows.find((item) => item.agencyId === agencyId && item.id === jobId); if (!row) return null; row.status = status; row.result = result; return row; }
  async appendActivity(input: Omit<AgencyActivity, "id" | "createdAt">) { const row = { id: id("activity"), ...input, createdAt: now() }; this.activities.push(row); return row; }
  async activity(agencyId: string, limit = 100) { return this.activities.filter((item) => item.agencyId === agencyId).sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit); }
  async createApiKey(input: { agencyId: string; name: string; prefix: string; secretHash: string; scopes: string[]; createdBy: string; expiresAt?: string | null }) { const row = { id: id("key"), ...input, expiresAt: input.expiresAt ?? null, createdAt: now(), lastUsedAt: null, revokedAt: null }; this.keyRows.push(row); const { secretHash, ...safe } = row; void secretHash; return safe; }
  async apiKeys(agencyId: string) { return this.keyRows.filter((item) => item.agencyId === agencyId).map(({ secretHash, ...safe }) => { void secretHash; return safe; }); }
  async authenticateApiKey(secretHash: string, at: Date) { const row = this.keyRows.find((item) => item.secretHash === secretHash && !item.revokedAt && (!item.expiresAt || new Date(item.expiresAt) > at)); if (!row) return null; row.lastUsedAt = at.toISOString(); const { secretHash: _, ...safe } = row; void _; return safe; }
  async revokeApiKey(agencyId: string, keyId: string) { const row = this.keyRows.find((item) => item.agencyId === agencyId && item.id === keyId); if (!row) return false; row.revokedAt = now(); return true; }
  async createInvite(input: { agencyId: string; email: string; role: AgencyMembership["role"]; kind: "seat" | "client_portal"; clientId?: string | null; tokenHash: string; createdBy: string; expiresAt: string }) { const row = { id: id("invite"), ...input, clientId: input.clientId ?? null, createdAt: now(), acceptedAt: null, acceptedBy: null, revokedAt: null }; this.inviteRows.push(row); const { tokenHash, ...safe } = row; void tokenHash; return safe; }
  async invites(agencyId: string) { return this.inviteRows.filter((item) => item.agencyId === agencyId).map(({ tokenHash, ...safe }) => { void tokenHash; return safe; }); }
  async acceptInvite(tokenHash: string, userId: string, email: string, at: Date) { const row = this.inviteRows.find((item) => item.tokenHash === tokenHash && item.email === email.toLowerCase() && !item.acceptedAt && !item.revokedAt && new Date(item.expiresAt) > at); if (!row) return null; row.acceptedAt = at.toISOString(); row.acceptedBy = userId; if (row.kind === "seat") await this.upsertMembership({ agencyId: row.agencyId, userId, role: row.role }); const { tokenHash: _, ...safe } = row; void _; return safe; }
  async hasPortalInvite(agencyId: string, clientId: string, userId: string) { return this.inviteRows.some((item) => item.agencyId === agencyId && item.clientId === clientId && item.kind === "client_portal" && item.acceptedBy === userId && !!item.acceptedAt && !item.revokedAt); }
  async createReport(input: { agencyId: string; clientOrgId?: string | null; periodStart: string; periodEnd: string; kind: AgencyReport["kind"]; title: string; content: Record<string, unknown>; branding: AgencyWorkspace["branding"]; createdBy: string }) { const row: AgencyReport = { id: id("report"), ...input, clientOrgId: input.clientOrgId ?? null, status: "ready", createdAt: now() }; this.reportRows.push(row); return row; }
  async reports(agencyId: string, limit = 100) { return this.reportRows.filter((item) => item.agencyId === agencyId).sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit); }
}
