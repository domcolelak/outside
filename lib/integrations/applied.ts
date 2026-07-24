/**
 * Record of remediations OUTSIDE actually applied to a customer's provider
 * account. Every write keeps the provider's rollback handle so the change can
 * be reversed later, plus who applied it — a DNS change must never be anonymous
 * or irreversible.
 */

import type { Prisma } from "@prisma/client";
import { prisma as database } from "@/lib/db/prisma";
import { storageMode } from "@/lib/config/storage";
import type { DnsRecordHandle } from "./cloudflare";

export interface AppliedRemediationRecord {
  id: string;
  orgId: string;
  provider: string;
  target: string;
  action: string;
  handle: DnsRecordHandle;
  appliedBy: string;
  appliedAt: string;
  rolledBackAt: string | null;
}

const g = globalThis as unknown as { __outsideAppliedRemediations?: AppliedRemediationRecord[] };
function mem() {
  return (g.__outsideAppliedRemediations ??= []);
}
function db() {
  return storageMode() === "database" ? database : null;
}

export async function recordApplied(input: {
  orgId: string;
  provider: string;
  target: string;
  action: string;
  handle: DnsRecordHandle;
  appliedBy: string;
}): Promise<AppliedRemediationRecord> {
  const conn = db();
  if (conn) {
    const row = await conn.appliedRemediation.create({
      data: { ...input, handle: input.handle as unknown as Prisma.InputJsonValue },
    });
    return {
      id: row.id,
      orgId: row.orgId,
      provider: row.provider,
      target: row.target,
      action: row.action,
      handle: row.handle as unknown as DnsRecordHandle,
      appliedBy: row.appliedBy,
      appliedAt: row.appliedAt.toISOString(),
      rolledBackAt: null,
    };
  }
  const record: AppliedRemediationRecord = {
    id: crypto.randomUUID(),
    ...input,
    appliedAt: new Date().toISOString(),
    rolledBackAt: null,
  };
  mem().push(record);
  return record;
}

/** The remediation still in effect for a target, if any. */
export async function activeRemediation(orgId: string, provider: string, target: string, action: string): Promise<AppliedRemediationRecord | null> {
  const conn = db();
  if (conn) {
    const row = await conn.appliedRemediation.findFirst({
      where: { orgId, provider, target, action, rolledBackAt: null },
      orderBy: { appliedAt: "desc" },
    });
    return row
      ? {
          id: row.id,
          orgId: row.orgId,
          provider: row.provider,
          target: row.target,
          action: row.action,
          handle: row.handle as unknown as DnsRecordHandle,
          appliedBy: row.appliedBy,
          appliedAt: row.appliedAt.toISOString(),
          rolledBackAt: null,
        }
      : null;
  }
  return mem().find((r) => r.orgId === orgId && r.provider === provider && r.target === target && r.action === action && !r.rolledBackAt) ?? null;
}

export async function markRolledBack(id: string): Promise<void> {
  const conn = db();
  if (conn) {
    await conn.appliedRemediation.updateMany({ where: { id, rolledBackAt: null }, data: { rolledBackAt: new Date() } });
    return;
  }
  const record = mem().find((r) => r.id === id);
  if (record) record.rolledBackAt = new Date().toISOString();
}

/** Test-only reset of the in-memory fallback store. */
export function __resetApplied(): void {
  g.__outsideAppliedRemediations = [];
}
