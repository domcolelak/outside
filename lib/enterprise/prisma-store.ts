import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { auditHash, canonicalAuditDetail } from "./audit";
import { SYSTEM_ROLES, type EnterpriseApiToken, type EnterpriseAuditEvent, type EnterpriseDelivery, type EnterpriseIdentityProvider, type EnterpriseIntegration, type EnterpriseOverview, type EnterpriseRecord, type EnterpriseResourceKind, type EnterpriseWorkspace } from "./types";
import type { AppendEnterpriseAuditInput, EnterpriseStore } from "./store-model";

interface ModelClient {
  findMany(args: object): Promise<unknown[]>;
  findUnique(args: object): Promise<unknown | null>;
  create(args: object): Promise<unknown>;
  upsert(args: object): Promise<unknown>;
  updateMany(args: object): Promise<{ count: number }>;
  deleteMany(args: object): Promise<{ count: number }>;
  count(args: object): Promise<number>;
}
interface EnterpriseDb {
  enterpriseWorkspace: ModelClient; enterpriseIdentityProvider: ModelClient; enterpriseRole: ModelClient;
  enterpriseRoleBinding: ModelClient; enterpriseOrgUnit: ModelClient; enterpriseOwnership: ModelClient;
  enterprisePolicy: ModelClient; enterpriseApproval: ModelClient; enterpriseRiskException: ModelClient;
  enterpriseApiToken: ModelClient; enterpriseIntegration: ModelClient; enterpriseTicketLink: ModelClient;
  enterpriseExport: ModelClient; enterpriseFeatureFlag: ModelClient; enterpriseAuditEvent: ModelClient;
  enterpriseDirectoryUser: ModelClient; enterpriseDirectoryGroup: ModelClient;
  enterpriseDelivery: ModelClient;
}

const db = prisma as unknown as EnterpriseDb;
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
function jsonSafe(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonSafe(item)]));
  return value;
}
const record = <T>(value: unknown): T => jsonSafe(value) as T;
async function appendAuditTx(transaction: Prisma.TransactionClient, input: AppendEnterpriseAuditInput): Promise<EnterpriseAuditEvent> {
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'outside:enterprise:audit:' + input.workspaceId}))`;
  const rows = await transaction.$queryRaw<Array<{ sequence: bigint; hash: string }>>`SELECT sequence, hash FROM enterprise_audit_events WHERE "workspaceId"=${input.workspaceId} ORDER BY sequence DESC LIMIT 1`;
  const sequence = (rows[0]?.sequence ?? 0n) + 1n;
  const previousHash = rows[0]?.hash ?? "GENESIS";
  const createdAt = new Date();
  const base = { sequence: sequence.toString(), actorType: input.actorType, actorId: input.actorId, action: input.action, resourceType: input.resourceType, resourceId: input.resourceId, requestId: input.requestId, ipHash: input.ipHash, detail: canonicalAuditDetail(input.detail), previousHash, createdAt: createdAt.toISOString() };
  const id = `eaudit_${randomUUID()}`;
  const hash = auditHash(base);
  await transaction.$executeRaw`INSERT INTO enterprise_audit_events (id,"workspaceId",sequence,"actorType","actorId",action,"resourceType","resourceId","requestId","ipHash",detail,"previousHash",hash,"createdAt") VALUES (${id},${input.workspaceId},${sequence},${input.actorType},${input.actorId},${input.action},${input.resourceType},${input.resourceId},${input.requestId},${input.ipHash},CAST(${JSON.stringify(base.detail)} AS jsonb),${previousHash},${hash},${createdAt})`;
  return { ...base, id, workspaceId: input.workspaceId, hash };
}
function dates(kind: EnterpriseResourceKind, input: Record<string, unknown>): Record<string, unknown> {
  const fields: Partial<Record<EnterpriseResourceKind, string[]>> = {
    identityProviders: ["lastSyncAt"], directoryUsers: ["lastSyncedAt"], directoryGroups: ["lastSyncedAt"], approvals: ["expiresAt", "decidedAt"], exceptions: ["expiresAt"],
    apiTokens: ["expiresAt", "lastUsedAt", "revokedAt"], integrations: ["lastDeliveryAt"],
    deliveries: ["nextAttemptAt", "leasedUntil", "deliveredAt"], tickets: ["lastSyncedAt"], exports: ["nextRunAt", "lastRunAt"],
  };
  const output = { ...input };
  for (const field of fields[kind] ?? []) if (typeof output[field] === "string") output[field] = new Date(output[field] as string);
  return output;
}
function model(client: EnterpriseDb, kind: EnterpriseResourceKind): ModelClient {
  const models: Record<EnterpriseResourceKind, ModelClient> = {
    identityProviders: client.enterpriseIdentityProvider, directoryUsers: client.enterpriseDirectoryUser, directoryGroups: client.enterpriseDirectoryGroup, roles: client.enterpriseRole, bindings: client.enterpriseRoleBinding,
    units: client.enterpriseOrgUnit, ownership: client.enterpriseOwnership, policies: client.enterprisePolicy,
    approvals: client.enterpriseApproval, exceptions: client.enterpriseRiskException, apiTokens: client.enterpriseApiToken,
    integrations: client.enterpriseIntegration, deliveries: client.enterpriseDelivery, tickets: client.enterpriseTicketLink, exports: client.enterpriseExport, flags: client.enterpriseFeatureFlag,
  };
  return models[kind];
}

export class PrismaEnterpriseStore implements EnterpriseStore {
  readonly durable = true;
  async workspace(id: string) { const row = await db.enterpriseWorkspace.findUnique({ where: { id } }); return row ? record<EnterpriseWorkspace>(row) : null; }
  async allWorkspaces(options?: { limit?: number; afterId?: string }) {
    return (await db.enterpriseWorkspace.findMany({
      where: options?.afterId ? { id: { gt: options.afterId } } : {},
      orderBy: { id: "asc" },
      ...(options?.limit ? { take: Math.min(Math.max(options.limit, 1), 501) } : {}),
    })).map((row) => record<EnterpriseWorkspace>(row));
  }
  async workspaceByOrg(orgId: string) { const row = await db.enterpriseWorkspace.findUnique({ where: { orgId } }); return row ? record<EnterpriseWorkspace>(row) : null; }
  async identityProvider(id: string) { const row = await db.enterpriseIdentityProvider.findUnique({ where: { id } }); return row ? record<EnterpriseIdentityProvider>(row) : null; }
  async identityProviderByDomain(domain: string) { const rows = await db.enterpriseIdentityProvider.findMany({ where: { domains: { has: domain.toLowerCase() } }, take: 1 }); return rows[0] ? record<EnterpriseIdentityProvider>(rows[0]) : null; }
  async integration(id: string) { const row = await db.enterpriseIntegration.findUnique({ where: { id } }); return row ? record<EnterpriseIntegration>(row) : null; }
  async provision(input: { orgId: string; ownerUserId: string; licensedSeats?: number; dataRegion?: EnterpriseWorkspace["dataRegion"]; expiresAt?: string | null }) {
    const existing = await this.workspaceByOrg(input.orgId); if (existing) return existing;
    const workspaceId = `enterprise_${randomUUID()}`;
    try {
      await prisma.$transaction(async (transaction) => {
        const tx = transaction as unknown as EnterpriseDb;
        await tx.enterpriseWorkspace.create({ data: { id: workspaceId, orgId: input.orgId, licenseStatus: "trial", licensedSeats: input.licensedSeats ?? 25, features: ["sso", "scim", "advanced_rbac", "audit_exports", "hierarchy", "ownership", "governance", "api", "integrations", "reporting", "data_controls"], dataRegion: input.dataRegion ?? "eu", retention: { auditDays: 2555, exportDays: 365 }, provisioningMode: "manual", expiresAt: input.expiresAt ? new Date(input.expiresAt) : null } });
        let ownerRoleId = "";
        for (const role of SYSTEM_ROLES) { const roleId = `erole_${randomUUID()}`; if (role.name === "Enterprise Owner") ownerRoleId = roleId; await tx.enterpriseRole.create({ data: { ...role, id: roleId, workspaceId } }); }
        await tx.enterpriseRoleBinding.create({ data: { id: `ebinding_${randomUUID()}`, workspaceId, roleId: ownerRoleId, principalType: "user", principalId: input.ownerUserId, scopeType: "organization", scopeId: null, conditions: {}, createdBy: input.ownerUserId } });
        await appendAuditTx(transaction, { workspaceId, actorType: "user", actorId: input.ownerUserId, action: "enterprise.workspace.provisioned", resourceType: "workspace", resourceId: workspaceId, requestId: null, ipHash: null, detail: { dataRegion: input.dataRegion ?? "eu", licensedSeats: input.licensedSeats ?? 25 } });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") { const concurrentlyCreated = await this.workspaceByOrg(input.orgId); if (concurrentlyCreated) return concurrentlyCreated; }
      throw error;
    }
    return (await this.workspace(workspaceId))!;
  }
  async updateWorkspace(id: string, patch: Partial<EnterpriseWorkspace>) {
    const data = { ...patch } as Record<string, unknown>; delete data.id; delete data.orgId; delete data.createdAt; delete data.updatedAt;
    if (typeof data.expiresAt === "string") data.expiresAt = new Date(data.expiresAt);
    if (!(await db.enterpriseWorkspace.updateMany({ where: { id }, data })).count) return null;
    return this.workspace(id);
  }
  async updateWorkspaceAudited(id: string, patch: Partial<EnterpriseWorkspace>, audit: Omit<AppendEnterpriseAuditInput, "workspaceId" | "resourceId">) {
    return prisma.$transaction(async (transaction) => {
      const tx = transaction as unknown as EnterpriseDb, data = { ...patch } as Record<string, unknown>;
      for (const key of ["id", "orgId", "createdAt", "updatedAt"]) delete data[key];
      if (typeof data.expiresAt === "string") data.expiresAt = new Date(data.expiresAt);
      if (!(await tx.enterpriseWorkspace.updateMany({ where: { id }, data })).count) return null;
      const row = await tx.enterpriseWorkspace.findUnique({ where: { id } });
      if (!row) return null;
      await appendAuditTx(transaction, { ...audit, workspaceId: id, resourceId: id });
      return record<EnterpriseWorkspace>(row);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
  async list<T extends EnterpriseRecord>(workspaceId: string, kind: EnterpriseResourceKind, options?: { limit?: number; afterId?: string }): Promise<T[]> { return (await model(db, kind).findMany({ where: { workspaceId, ...(options?.afterId ? { id: { gt: options.afterId } } : {}) }, orderBy: { id: "asc" }, ...(options?.limit ? { take: Math.min(Math.max(options.limit, 1), 1000) } : {}) })).map((item) => record<T>(item)); }
  async resource<T extends EnterpriseRecord>(workspaceId: string, kind: EnterpriseResourceKind, id: string): Promise<T | null> { const row = await model(db, kind).findUnique({ where: { id } }); return row && object(row).workspaceId === workspaceId ? record<T>(row) : null; }
  async create<T extends EnterpriseRecord>(workspaceId: string, kind: EnterpriseResourceKind, input: Omit<T, "id" | "workspaceId" | "createdAt" | "updatedAt">): Promise<T> { return record<T>(await model(db, kind).create({ data: { ...dates(kind, object(input)), id: `${kind}_${randomUUID()}`, workspaceId } })); }
  async createAudited<T extends EnterpriseRecord>(workspaceId: string, kind: EnterpriseResourceKind, input: Omit<T, "id" | "workspaceId" | "createdAt" | "updatedAt">, audit: Omit<AppendEnterpriseAuditInput, "workspaceId" | "resourceId">): Promise<T> { return prisma.$transaction(async (transaction) => { const item = record<T>(await model(transaction as unknown as EnterpriseDb, kind).create({ data: { ...dates(kind, object(input)), id: `${kind}_${randomUUID()}`, workspaceId } })); await appendAuditTx(transaction, { ...audit, workspaceId, resourceId: item.id }); return item; }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
  async update<T extends EnterpriseRecord>(workspaceId: string, kind: EnterpriseResourceKind, id: string, patch: Partial<T>): Promise<T | null> { const data = dates(kind, object(patch)); for (const key of ["id", "workspaceId", "createdAt", "updatedAt", "secretHash", "scimTokenHash"]) delete data[key]; if (!(await model(db, kind).updateMany({ where: { id, workspaceId }, data })).count) return null; const row = await model(db, kind).findUnique({ where: { id } }); return row ? record<T>(row) : null; }
  async updateAudited<T extends EnterpriseRecord>(workspaceId: string, kind: EnterpriseResourceKind, id: string, patch: Partial<T>, audit: Omit<AppendEnterpriseAuditInput, "workspaceId" | "resourceId">): Promise<T | null> { return prisma.$transaction(async (transaction) => { const tx = transaction as unknown as EnterpriseDb, data = dates(kind, object(patch)); for (const key of ["id", "workspaceId", "createdAt", "updatedAt", "secretHash", "scimTokenHash"]) delete data[key]; if (!(await model(tx, kind).updateMany({ where: { id, workspaceId }, data })).count) return null; const row = await model(tx, kind).findUnique({ where: { id } }); if (!row) return null; await appendAuditTx(transaction, { ...audit, workspaceId, resourceId: id }); return record<T>(row); }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
  async remove(workspaceId: string, kind: EnterpriseResourceKind, id: string) { return (await model(db, kind).deleteMany({ where: { id, workspaceId } })).count === 1; }
  async removeAudited(workspaceId: string, kind: EnterpriseResourceKind, id: string, audit: Omit<AppendEnterpriseAuditInput, "workspaceId" | "resourceId">) { return prisma.$transaction(async (transaction) => { const removed = (await model(transaction as unknown as EnterpriseDb, kind).deleteMany({ where: { id, workspaceId } })).count === 1; if (removed) await appendAuditTx(transaction, { ...audit, workspaceId, resourceId: id }); return removed; }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
  async authenticateApiToken(hash: string, now: Date) { const rows = await db.enterpriseApiToken.findMany({ where: { secretHash: hash, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, take: 1 }); const row = rows[0]; if (!row) return null; await db.enterpriseApiToken.updateMany({ where: { id: object(row).id }, data: { lastUsedAt: now } }); return record<EnterpriseApiToken>(row); }
  async authenticateScimToken(hash: string) { const rows = await db.enterpriseIdentityProvider.findMany({ where: { scimTokenHash: hash, enabled: true }, take: 1 }); return rows[0] ? record<EnterpriseIdentityProvider>(rows[0]) : null; }
  async rotateScimToken(workspaceId: string, id: string, hash: string, prefix: string) { if (!(await db.enterpriseIdentityProvider.updateMany({ where: { id, workspaceId }, data: { scimTokenHash: hash, scimTokenPrefix: prefix } })).count) return null; return this.identityProvider(id); }
  async rotateScimTokenAudited(workspaceId: string, id: string, hash: string, prefix: string, audit: Omit<AppendEnterpriseAuditInput, "workspaceId" | "resourceId">) { return prisma.$transaction(async (transaction) => { const tx = transaction as unknown as EnterpriseDb; if (!(await tx.enterpriseIdentityProvider.updateMany({ where: { id, workspaceId }, data: { scimTokenHash: hash, scimTokenPrefix: prefix } })).count) return null; const row = await tx.enterpriseIdentityProvider.findUnique({ where: { id } }); if (!row) return null; await appendAuditTx(transaction, { ...audit, workspaceId, resourceId: id }); return record<EnterpriseIdentityProvider>(row); }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
  async provisionScimUserAtomic(input: { workspaceId: string; orgId: string; providerId: string; email: string; name: string; passwordHash: string; externalId: string | null; active: boolean }, audit: Omit<AppendEnterpriseAuditInput, "workspaceId" | "resourceId">) {
    return prisma.$transaction(async (transaction) => {
      const tx = transaction as unknown as EnterpriseDb;
      const user = await transaction.user.upsert({ where: { email: input.email }, create: { email: input.email, name: input.name, passwordHash: input.passwordHash, emailVerifiedAt: new Date() }, update: { name: input.name } });
      await transaction.$executeRaw`INSERT INTO memberships ("userId","orgId",role,"notifyChanges",active,"provisionedBy") VALUES (${user.id},${input.orgId},CAST(${"viewer"} AS "Role"),true,${input.active},${input.providerId}) ON CONFLICT ("userId","orgId") DO UPDATE SET active=EXCLUDED.active,"provisionedBy"=EXCLUDED."provisionedBy"`;
      const item = record<import("./types").EnterpriseDirectoryUser>(await tx.enterpriseDirectoryUser.create({ data: { id: `directoryUsers_${randomUUID()}`, workspaceId: input.workspaceId, identityProviderId: input.providerId, userId: user.id, externalId: input.externalId, userName: input.email, displayName: input.name, active: input.active, departmentId: null, attributes: {}, lastSyncedAt: new Date() } }));
      await appendAuditTx(transaction, { ...audit, workspaceId: input.workspaceId, resourceId: item.id });
      return item;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
  async updateScimUserAtomic(input: { workspaceId: string; orgId: string; providerId: string; id: string; patch: Partial<import("./types").EnterpriseDirectoryUser> }, audit: Omit<AppendEnterpriseAuditInput, "workspaceId" | "resourceId">) {
    return prisma.$transaction(async (transaction) => {
      const tx = transaction as unknown as EnterpriseDb;
      const data = dates("directoryUsers", object(input.patch)); for (const key of ["id", "workspaceId", "createdAt", "updatedAt", "identityProviderId", "userId", "userName"]) delete data[key];
      if (!(await tx.enterpriseDirectoryUser.updateMany({ where: { id: input.id, workspaceId: input.workspaceId, identityProviderId: input.providerId }, data })).count) return null;
      const raw = await tx.enterpriseDirectoryUser.findUnique({ where: { id: input.id } }); if (!raw) return null;
      const item = record<import("./types").EnterpriseDirectoryUser>(raw);
      if (typeof input.patch.active === "boolean" && item.userId) {
        const changed = await transaction.$executeRaw`UPDATE memberships SET active=${input.patch.active} WHERE "userId"=${item.userId} AND "orgId"=${input.orgId} AND "provisionedBy"=${input.providerId}`;
        if (changed !== 1) throw new Error("Provisioned organization membership is missing.");
        if (!input.patch.active) await transaction.user.update({ where: { id: item.userId }, data: { sessionVersion: { increment: 1 } } });
      }
      await appendAuditTx(transaction, { ...audit, workspaceId: input.workspaceId, resourceId: input.id });
      return item;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
  async deleteScimUserAtomic(input: { workspaceId: string; orgId: string; providerId: string; id: string }, audit: Omit<AppendEnterpriseAuditInput, "workspaceId" | "resourceId">) {
    return prisma.$transaction(async (transaction) => {
      const tx = transaction as unknown as EnterpriseDb;
      const raw = (await tx.enterpriseDirectoryUser.findMany({ where: { id: input.id, workspaceId: input.workspaceId, identityProviderId: input.providerId }, take: 1 }))[0];
      const item = raw ? record<import("./types").EnterpriseDirectoryUser>(raw) : null;
      if (!item) return { removed: false, groups: 0, bindings: 0 };
      if (item.userId) {
        await transaction.$executeRaw`UPDATE memberships SET active=false WHERE "userId"=${item.userId} AND "orgId"=${input.orgId} AND "provisionedBy"=${input.providerId}`;
        await transaction.user.update({ where: { id: item.userId }, data: { sessionVersion: { increment: 1 } } });
      }
      const groups = (await tx.enterpriseDirectoryGroup.findMany({ where: { workspaceId: input.workspaceId, identityProviderId: input.providerId, memberIds: { has: input.id } } })).map((group) => record<import("./types").EnterpriseDirectoryGroup>(group));
      for (const group of groups) await tx.enterpriseDirectoryGroup.updateMany({ where: { id: group.id, workspaceId: input.workspaceId }, data: { memberIds: group.memberIds.filter((memberId: string) => memberId !== input.id), lastSyncedAt: new Date() } });
      const bindings = await tx.enterpriseRoleBinding.deleteMany({ where: { workspaceId: input.workspaceId, principalType: "user", principalId: input.id } });
      await tx.enterpriseDirectoryUser.deleteMany({ where: { id: input.id, workspaceId: input.workspaceId } });
      await appendAuditTx(transaction, { ...audit, workspaceId: input.workspaceId, resourceId: input.id, detail: { ...audit.detail, removedRoleBindings: bindings.count, updatedGroups: groups.length } });
      return { removed: true, groups: groups.length, bindings: bindings.count };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
  async deleteScimGroupAtomic(input: { workspaceId: string; providerId: string; id: string }, audit: Omit<AppendEnterpriseAuditInput, "workspaceId" | "resourceId">) {
    return prisma.$transaction(async (transaction) => {
      const tx = transaction as unknown as EnterpriseDb;
      const item = (await tx.enterpriseDirectoryGroup.findMany({ where: { id: input.id, workspaceId: input.workspaceId, identityProviderId: input.providerId }, take: 1 }))[0];
      if (!item) return { removed: false, bindings: 0 };
      const bindings = await tx.enterpriseRoleBinding.deleteMany({ where: { workspaceId: input.workspaceId, principalType: "group", principalId: input.id } });
      await tx.enterpriseDirectoryGroup.deleteMany({ where: { id: input.id, workspaceId: input.workspaceId } });
      await appendAuditTx(transaction, { ...audit, workspaceId: input.workspaceId, resourceId: input.id, detail: { ...audit.detail, removedRoleBindings: bindings.count } });
      return { removed: true, bindings: bindings.count };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
  async enqueueDelivery(input: { workspaceId: string; integrationId: string; idempotencyKey: string; eventId: string; payload: Record<string, unknown> }) { const existing = await db.enterpriseDelivery.findUnique({ where: { idempotencyKey: input.idempotencyKey } }); if (existing) return record<EnterpriseDelivery>(existing); try { return await this.create<EnterpriseDelivery>(input.workspaceId, "deliveries", { integrationId: input.integrationId, idempotencyKey: input.idempotencyKey, eventId: input.eventId, payload: input.payload, status: "pending", attempts: 0, nextAttemptAt: new Date().toISOString(), leaseId: null, leasedUntil: null, lastError: null, deliveredAt: null }); } catch { const row = await db.enterpriseDelivery.findUnique({ where: { idempotencyKey: input.idempotencyKey } }); if (!row) throw new Error("Idempotent enterprise delivery could not be resolved."); return record<EnterpriseDelivery>(row); } }
  async enqueueEventAudited(input: { workspaceId: string; integrations: Array<{ id: string; idempotencyKey: string }>; eventId: string; payload: Record<string, unknown> }, audit: Omit<AppendEnterpriseAuditInput, "workspaceId" | "resourceId">) { return prisma.$transaction(async (transaction) => { const tx = transaction as unknown as EnterpriseDb, now = new Date(); for (const integration of input.integrations) await tx.enterpriseDelivery.upsert({ where: { idempotencyKey: integration.idempotencyKey }, update: {}, create: { id: `deliveries_${randomUUID()}`, workspaceId: input.workspaceId, integrationId: integration.id, idempotencyKey: integration.idempotencyKey, eventId: input.eventId, payload: input.payload as Prisma.InputJsonValue, status: "pending", attempts: 0, nextAttemptAt: now, leaseId: null, leasedUntil: null, lastError: null, deliveredAt: null, createdAt: now, updatedAt: now } }); await appendAuditTx(transaction, { ...audit, workspaceId: input.workspaceId, resourceId: null, detail: { ...audit.detail, integrations: input.integrations.length } }); return input.integrations.length; }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
  async claimDeliveries(now: Date, limit: number, leaseMs: number) { const leaseId = randomUUID(), leasedUntil = new Date(now.getTime() + leaseMs); const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`UPDATE enterprise_deliveries SET status='processing', attempts=attempts+1,"leaseId"=${leaseId},"leasedUntil"=${leasedUntil} WHERE id IN (SELECT id FROM enterprise_deliveries WHERE status IN ('pending','processing') AND "nextAttemptAt"<=${now} AND ("leasedUntil" IS NULL OR "leasedUntil"<=${now}) ORDER BY "nextAttemptAt" FOR UPDATE SKIP LOCKED LIMIT ${Math.min(limit, 100)}) RETURNING *`; return rows.map((row) => record<EnterpriseDelivery>(row)); }
  async finishDelivery(workspaceId: string, id: string, leaseId: string, result: { delivered: boolean; error?: string }) { const rows = await db.enterpriseDelivery.findMany({ where: { id, workspaceId, leaseId }, take: 1 }) as Array<Record<string, unknown>>; const attempts = Number(rows[0]?.attempts ?? 0); if (!rows[0]) return false; const delivered = result.delivered, dead = !delivered && attempts >= 8; return (await db.enterpriseDelivery.updateMany({ where: { id, workspaceId, leaseId }, data: { status: delivered ? "delivered" : dead ? "dead_letter" : "pending", deliveredAt: delivered ? new Date() : null, lastError: delivered ? null : (result.error ?? "Delivery failed").slice(0, 1000), nextAttemptAt: delivered || dead ? new Date() : new Date(Date.now() + Math.min(3_600_000, 2 ** attempts * 1000)), leaseId: null, leasedUntil: null } })).count === 1; }
  async updateTicketInbound(workspaceId: string, id: string, expectedVersion: number, patch: Partial<import("./types").EnterpriseTicketLink>) { const data = dates("tickets", object(patch)); for (const key of ["id", "workspaceId", "createdAt", "updatedAt"]) delete data[key]; if (!(await db.enterpriseTicketLink.updateMany({ where: { id, workspaceId, syncVersion: expectedVersion }, data })).count) return null; const row = await db.enterpriseTicketLink.findUnique({ where: { id } }); return row ? record<import("./types").EnterpriseTicketLink>(row) : null; }
  async updateTicketInboundAudited(workspaceId: string, id: string, expectedVersion: number, patch: Partial<import("./types").EnterpriseTicketLink>, audit: Omit<AppendEnterpriseAuditInput, "workspaceId" | "resourceId">) { return prisma.$transaction(async (transaction) => { const tx = transaction as unknown as EnterpriseDb, data = dates("tickets", object(patch)); for (const key of ["id", "workspaceId", "createdAt", "updatedAt"]) delete data[key]; if (!(await tx.enterpriseTicketLink.updateMany({ where: { id, workspaceId, syncVersion: expectedVersion }, data })).count) return null; const row = await tx.enterpriseTicketLink.findUnique({ where: { id } }); if (!row) return null; await appendAuditTx(transaction, { ...audit, workspaceId, resourceId: id }); return record<import("./types").EnterpriseTicketLink>(row); }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
  async purgeRetention(workspaceId: string, cutoffs: { deliveries: Date; tickets: Date }) { const [deliveries, tickets] = await prisma.$transaction([prisma.$executeRaw`DELETE FROM enterprise_deliveries WHERE "workspaceId"=${workspaceId} AND status IN ('delivered','dead_letter') AND COALESCE("deliveredAt","createdAt")<${cutoffs.deliveries}`, prisma.$executeRaw`DELETE FROM enterprise_ticket_links WHERE "workspaceId"=${workspaceId} AND "lastSyncedAt"<${cutoffs.tickets}`]); return { deliveries, tickets }; }
  async appendAudit(input: AppendEnterpriseAuditInput): Promise<EnterpriseAuditEvent> {
    return prisma.$transaction((transaction) => appendAuditTx(transaction, input), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
  async auditEvents(workspaceId: string, limit = 250, afterSequence?: string) { const after = afterSequence && /^\d+$/.test(afterSequence) ? BigInt(afterSequence) : 0n; const rows = await db.enterpriseAuditEvent.findMany({ where: { workspaceId, sequence: { gt: after } }, orderBy: { sequence: "asc" }, take: Math.min(Math.max(limit, 1), 5000) }); return rows.map((row) => record<EnterpriseAuditEvent>(row)); }
  async overview(workspaceId: string): Promise<EnterpriseOverview | null> {
    const workspace = await this.workspace(workspaceId); if (!workspace) return null;
    const kinds = ["identityProviders", "directoryUsers", "directoryGroups", "roles", "bindings", "units", "ownership", "policies", "approvals", "exceptions", "apiTokens", "integrations", "deliveries", "tickets", "exports", "flags"] as EnterpriseResourceKind[];
    const [countEntries, rawIdentityProviders, rawPendingApprovals, rawExpiringExceptions, rawIntegrations, rawFlags, auditCount, auditHeadRows] = await Promise.all([
      Promise.all(kinds.map(async (kind) => [kind, await model(db, kind).count({ where: { workspaceId } })] as const)),
      db.enterpriseIdentityProvider.findMany({ where: { workspaceId }, orderBy: { id: "asc" }, take: 1000 }),
      db.enterpriseApproval.findMany({ where: { workspaceId, status: "pending" }, orderBy: { id: "asc" }, take: 1000 }),
      db.enterpriseRiskException.findMany({ where: { workspaceId, status: "approved" }, orderBy: { id: "asc" }, take: 1000 }),
      db.enterpriseIntegration.findMany({ where: { workspaceId }, orderBy: { id: "asc" }, take: 1000 }),
      db.enterpriseFeatureFlag.findMany({ where: { workspaceId }, orderBy: { id: "asc" }, take: 1000 }),
      db.enterpriseAuditEvent.count({ where: { workspaceId } }),
      db.enterpriseAuditEvent.findMany({ where: { workspaceId }, orderBy: { sequence: "desc" }, take: 1 }),
    ]);
    const counts = Object.fromEntries(countEntries) as EnterpriseOverview["counts"];
    counts.audit = auditCount;
    const identityProviders = rawIdentityProviders.map((row) => record<EnterpriseIdentityProvider>(row)).map(({ configEncrypted: _config, scimTokenHash: _hash, ...item }) => item);
    const integrations = rawIntegrations.map((row) => record<EnterpriseIntegration>(row)).map(({ configEncrypted: _config, ...item }) => item);
    const auditHead = auditHeadRows[0] ? record<EnterpriseAuditEvent>(auditHeadRows[0]) : null;
    return {
      workspace,
      counts,
      identityProviders,
      pendingApprovals: rawPendingApprovals.map((row) => record(row)) as EnterpriseOverview["pendingApprovals"],
      expiringExceptions: rawExpiringExceptions.map((row) => record(row)) as EnterpriseOverview["expiringExceptions"],
      integrations,
      flags: rawFlags.map((row) => record(row)) as EnterpriseOverview["flags"],
      auditHead: auditHead ? { sequence: auditHead.sequence, hash: auditHead.hash } : null,
    };
  }
}
