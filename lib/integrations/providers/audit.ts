/**
 * Shared, immutable audit trail for provider credential lifecycle events.
 * Records the actor and a non-secret detail only — never the credential. Also
 * mirrors each event to the operational log stream. Every provider uses this.
 */

import { prisma as database } from "@/lib/db/prisma";
import { storageMode } from "@/lib/config/storage";
import { operationalLog } from "@/lib/observability/log";
import type { IntegrationProvider } from "@/lib/integrations/connections";

export type ProviderAuditAction = "connected" | "validated" | "replaced" | "disconnected";

export interface ProviderAuditEntry {
  action: ProviderAuditAction;
  actorId: string;
  detail?: string;
  createdAt: string;
}

interface AuditRow extends ProviderAuditEntry {
  orgId: string;
  provider: IntegrationProvider;
}

const g = globalThis as unknown as { __outsideProviderAudit?: AuditRow[] };
function mem() {
  return (g.__outsideProviderAudit ??= []);
}
function db() {
  return storageMode() === "database" ? database : null;
}

export async function recordProviderAudit(input: {
  orgId: string;
  provider: IntegrationProvider;
  action: ProviderAuditAction;
  actorId: string;
  detail?: string;
}): Promise<void> {
  const conn = db();
  try {
    if (conn) {
      await conn.providerAuditEvent.create({
        data: { orgId: input.orgId, provider: input.provider, action: input.action, actorId: input.actorId, detail: input.detail ?? null },
      });
    } else {
      mem().push({ ...input, createdAt: new Date().toISOString() });
    }
  } catch (error) {
    operationalLog("error", `integrations.${input.provider}_${input.action}_audit_failed`, { orgId: input.orgId, actorId: input.actorId }, error);
    throw error;
  }
  operationalLog("info", `integrations.${input.provider}_${input.action}`, { orgId: input.orgId, actorId: input.actorId, detail: input.detail });
}

export async function providerAuditTrail(orgId: string, provider: IntegrationProvider, limit = 20): Promise<ProviderAuditEntry[]> {
  const conn = db();
  if (conn) {
    const rows = await conn.providerAuditEvent.findMany({ where: { orgId, provider }, orderBy: { createdAt: "desc" }, take: limit });
    return rows.map((r) => ({ action: r.action as ProviderAuditAction, actorId: r.actorId, detail: r.detail ?? undefined, createdAt: r.createdAt.toISOString() }));
  }
  return mem()
    .filter((r) => r.orgId === orgId && r.provider === provider)
    .slice(-limit)
    .reverse()
    .map((r) => ({ action: r.action, actorId: r.actorId, detail: r.detail, createdAt: r.createdAt }));
}

/** Test-only reset of the in-memory fallback. */
export function __resetProviderAudit(): void {
  g.__outsideProviderAudit = [];
}
