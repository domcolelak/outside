import { createHash } from "node:crypto";
import type { EnterpriseAuditEvent } from "./types";

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

export function canonicalAuditDetail(value: Record<string, unknown>): Record<string, unknown> { return JSON.parse(JSON.stringify(value)) as Record<string, unknown>; }

export function auditHash(event: Omit<EnterpriseAuditEvent, "id" | "hash" | "workspaceId">): string {
  return createHash("sha256").update(canonical(event)).digest("hex");
}

export function verifyAuditChain(events: EnterpriseAuditEvent[]): { valid: boolean; checked: number; brokenAt: string | null; head: string | null } {
  const ordered = [...events].sort((a, b) => BigInt(a.sequence) < BigInt(b.sequence) ? -1 : 1);
  let previous = "GENESIS";
  for (const event of ordered) {
    const expected = auditHash({ sequence: event.sequence, actorType: event.actorType, actorId: event.actorId, action: event.action, resourceType: event.resourceType, resourceId: event.resourceId, requestId: event.requestId, ipHash: event.ipHash, detail: event.detail, previousHash: previous, createdAt: event.createdAt });
    if (event.previousHash !== previous || event.hash !== expected) return { valid: false, checked: ordered.indexOf(event), brokenAt: event.sequence, head: previous === "GENESIS" ? null : previous };
    previous = event.hash;
  }
  return { valid: true, checked: ordered.length, brokenAt: null, head: previous === "GENESIS" ? null : previous };
}

export function hashIp(value: string | null): string | null {
  if (!value) return null;
  const salt = process.env.AUDIT_IP_SALT?.trim();
  if (!salt && process.env.NODE_ENV === "production") throw new Error("AUDIT_IP_SALT is required in production.");
  return createHash("sha256").update(`${salt ?? "outside-local"}:${value}`).digest("hex");
}
