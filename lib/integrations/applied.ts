/**
 * Record of remediations OUTSIDE actually applied to a customer's provider
 * account. Every write keeps the provider's rollback handle so the change can
 * be reversed later, plus who applied it — a DNS change must never be anonymous
 * or irreversible. Each record also carries its post-change check: what public
 * DNS served afterwards, and when that was last observed.
 */

import type { Prisma } from "@prisma/client";
import { prisma as database } from "@/lib/db/prisma";
import { storageMode } from "@/lib/config/storage";
import type { DnsRecordHandle } from "./cloudflare";
import type { RemediationCheck, RemediationCheckStatus } from "./verification";

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
  /** Null until the change has actually been checked from outside. */
  verification: RemediationCheck | null;
}

type Row = {
  id: string;
  orgId: string;
  provider: string;
  target: string;
  action: string;
  handle: unknown;
  appliedBy: string;
  appliedAt: Date;
  rolledBackAt: Date | null;
  verifiedAt: Date | null;
  verifyStatus: string | null;
  verifyObserved: string | null;
};

const g = globalThis as unknown as { __outsideAppliedRemediations?: AppliedRemediationRecord[] };
function mem() {
  return (g.__outsideAppliedRemediations ??= []);
}
function db() {
  return storageMode() === "database" ? database : null;
}

/** A stored check is only meaningful with the timestamp it was observed at. */
function toRecord(row: Row): AppliedRemediationRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    provider: row.provider,
    target: row.target,
    action: row.action,
    handle: row.handle as unknown as DnsRecordHandle,
    appliedBy: row.appliedBy,
    appliedAt: row.appliedAt.toISOString(),
    rolledBackAt: row.rolledBackAt ? row.rolledBackAt.toISOString() : null,
    verification:
      row.verifiedAt && row.verifyStatus
        ? { status: row.verifyStatus as RemediationCheckStatus, observed: row.verifyObserved, checkedAt: row.verifiedAt.toISOString() }
        : null,
  };
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
    return toRecord(row as Row);
  }
  const record: AppliedRemediationRecord = {
    id: crypto.randomUUID(),
    ...input,
    appliedAt: new Date().toISOString(),
    rolledBackAt: null,
    verification: null,
  };
  mem().push(record);
  return record;
}

/**
 * Store the result of a post-change check. Failing to persist it must never
 * undo the remediation itself — the change is already live, and an unrecorded
 * check is merely unknown, which is exactly what a null verification means.
 */
export async function recordVerification(id: string, check: RemediationCheck): Promise<void> {
  const conn = db();
  if (conn) {
    await conn.appliedRemediation.updateMany({
      where: { id },
      data: { verifiedAt: new Date(check.checkedAt), verifyStatus: check.status, verifyObserved: check.observed },
    });
    return;
  }
  const record = mem().find((r) => r.id === id);
  if (record) record.verification = check;
}

/** The remediation still in effect for a target, if any. */
export async function activeRemediation(orgId: string, provider: string, target: string, action: string): Promise<AppliedRemediationRecord | null> {
  const conn = db();
  if (conn) {
    const row = await conn.appliedRemediation.findFirst({
      where: { orgId, provider, target, action, rolledBackAt: null },
      orderBy: { appliedAt: "desc" },
    });
    return row ? toRecord(row as Row) : null;
  }
  return mem().find((r) => r.orgId === orgId && r.provider === provider && r.target === target && r.action === action && !r.rolledBackAt) ?? null;
}

/** All provider changes that still require the connected credential for rollback. */
export async function listActiveRemediations(orgId: string, provider: string): Promise<AppliedRemediationRecord[]> {
  const conn = db();
  if (conn) {
    const rows = await conn.appliedRemediation.findMany({
      where: { orgId, provider, rolledBackAt: null },
      orderBy: { appliedAt: "desc" },
    });
    return rows.map((row) => toRecord(row as Row));
  }
  return mem().filter((record) => record.orgId === orgId && record.provider === provider && !record.rolledBackAt);
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
