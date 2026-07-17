import type { EnterpriseApiToken, EnterpriseAuditEvent, EnterpriseDelivery, EnterpriseDirectoryGroup, EnterpriseDirectoryUser, EnterpriseIdentityProvider, EnterpriseOverview, EnterpriseRecord, EnterpriseResourceKind, EnterpriseWorkspace } from "./types";

export interface AppendEnterpriseAuditInput {
  workspaceId: string;
  actorType: EnterpriseAuditEvent["actorType"];
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  requestId: string | null;
  ipHash: string | null;
  detail: Record<string, unknown>;
}

export interface EnterpriseStore {
  readonly durable: boolean;
  workspace(id: string): Promise<EnterpriseWorkspace | null>;
  allWorkspaces(options?: { limit?: number; afterId?: string }): Promise<EnterpriseWorkspace[]>;
  workspaceByOrg(orgId: string): Promise<EnterpriseWorkspace | null>;
  identityProvider(id: string): Promise<EnterpriseIdentityProvider | null>;
  identityProviderByDomain(domain: string): Promise<EnterpriseIdentityProvider | null>;
  integration(id: string): Promise<import("./types").EnterpriseIntegration | null>;
  provision(input: { orgId: string; ownerUserId: string; licensedSeats?: number; dataRegion?: EnterpriseWorkspace["dataRegion"]; expiresAt?: string | null }): Promise<EnterpriseWorkspace>;
  updateWorkspace(id: string, patch: Partial<Pick<EnterpriseWorkspace, "licenseStatus" | "licensedSeats" | "features" | "dataRegion" | "retention" | "provisioningMode" | "expiresAt">>): Promise<EnterpriseWorkspace | null>;
  updateWorkspaceAudited(id: string, patch: Partial<Pick<EnterpriseWorkspace, "licenseStatus" | "licensedSeats" | "features" | "dataRegion" | "retention" | "provisioningMode" | "expiresAt">>, audit: Omit<AppendEnterpriseAuditInput, "workspaceId" | "resourceId">): Promise<EnterpriseWorkspace | null>;
  overview(workspaceId: string): Promise<EnterpriseOverview | null>;
  list<T extends EnterpriseRecord>(workspaceId: string, kind: EnterpriseResourceKind, options?: { limit?: number; afterId?: string }): Promise<T[]>;
  resource<T extends EnterpriseRecord>(workspaceId: string, kind: EnterpriseResourceKind, id: string): Promise<T | null>;
  create<T extends EnterpriseRecord>(workspaceId: string, kind: EnterpriseResourceKind, input: Omit<T, "id" | "workspaceId" | "createdAt" | "updatedAt">): Promise<T>;
  createAudited<T extends EnterpriseRecord>(workspaceId: string, kind: EnterpriseResourceKind, input: Omit<T, "id" | "workspaceId" | "createdAt" | "updatedAt">, audit: Omit<AppendEnterpriseAuditInput, "workspaceId" | "resourceId">): Promise<T>;
  update<T extends EnterpriseRecord>(workspaceId: string, kind: EnterpriseResourceKind, id: string, patch: Partial<T>): Promise<T | null>;
  updateAudited<T extends EnterpriseRecord>(workspaceId: string, kind: EnterpriseResourceKind, id: string, patch: Partial<T>, audit: Omit<AppendEnterpriseAuditInput, "workspaceId" | "resourceId">): Promise<T | null>;
  remove(workspaceId: string, kind: EnterpriseResourceKind, id: string): Promise<boolean>;
  removeAudited(workspaceId: string, kind: EnterpriseResourceKind, id: string, audit: Omit<AppendEnterpriseAuditInput, "workspaceId" | "resourceId">): Promise<boolean>;
  authenticateApiToken(hash: string, now: Date): Promise<EnterpriseApiToken | null>;
  authenticateScimToken(hash: string): Promise<EnterpriseIdentityProvider | null>;
  rotateScimToken(workspaceId: string, id: string, hash: string, prefix: string): Promise<EnterpriseIdentityProvider | null>;
  rotateScimTokenAudited(workspaceId: string, id: string, hash: string, prefix: string, audit: Omit<AppendEnterpriseAuditInput, "workspaceId" | "resourceId">): Promise<EnterpriseIdentityProvider | null>;
  provisionScimUserAtomic?(input: { workspaceId: string; orgId: string; providerId: string; email: string; name: string; passwordHash: string; externalId: string | null; active: boolean }, audit: Omit<AppendEnterpriseAuditInput, "workspaceId" | "resourceId">): Promise<EnterpriseDirectoryUser>;
  updateScimUserAtomic?(input: { workspaceId: string; orgId: string; providerId: string; id: string; patch: Partial<EnterpriseDirectoryUser> }, audit: Omit<AppendEnterpriseAuditInput, "workspaceId" | "resourceId">): Promise<EnterpriseDirectoryUser | null>;
  deleteScimUserAtomic?(input: { workspaceId: string; orgId: string; providerId: string; id: string }, audit: Omit<AppendEnterpriseAuditInput, "workspaceId" | "resourceId">): Promise<{ removed: boolean; groups: number; bindings: number }>;
  deleteScimGroupAtomic?(input: { workspaceId: string; providerId: string; id: string }, audit: Omit<AppendEnterpriseAuditInput, "workspaceId" | "resourceId">): Promise<{ removed: boolean; bindings: number }>;
  enqueueDelivery(input: { workspaceId: string; integrationId: string; idempotencyKey: string; eventId: string; payload: Record<string, unknown> }): Promise<EnterpriseDelivery>;
  enqueueEventAudited(input: { workspaceId: string; integrations: Array<{ id: string; idempotencyKey: string }>; eventId: string; payload: Record<string, unknown> }, audit: Omit<AppendEnterpriseAuditInput, "workspaceId" | "resourceId">): Promise<number>;
  claimDeliveries(now: Date, limit: number, leaseMs: number): Promise<EnterpriseDelivery[]>;
  finishDelivery(workspaceId: string, id: string, leaseId: string, result: { delivered: boolean; error?: string }): Promise<boolean>;
  updateTicketInbound(workspaceId: string, id: string, expectedVersion: number, patch: Partial<import("./types").EnterpriseTicketLink>): Promise<import("./types").EnterpriseTicketLink | null>;
  updateTicketInboundAudited(workspaceId: string, id: string, expectedVersion: number, patch: Partial<import("./types").EnterpriseTicketLink>, audit: Omit<AppendEnterpriseAuditInput, "workspaceId" | "resourceId">): Promise<import("./types").EnterpriseTicketLink | null>;
  purgeRetention(workspaceId: string, cutoffs: { deliveries: Date; tickets: Date }): Promise<{ deliveries: number; tickets: number }>;
  appendAudit(input: AppendEnterpriseAuditInput): Promise<EnterpriseAuditEvent>;
  auditEvents(workspaceId: string, limit?: number, afterSequence?: string): Promise<EnterpriseAuditEvent[]>;
}
