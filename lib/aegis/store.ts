/** Organization-isolated Aegis recommendation state and audit trail. */

import type { AuditEvent, Posture, RecommendationStatus } from "./types";
import { prisma as database } from "@/lib/db/prisma";

const g = globalThis as unknown as {
  __outsideRecStatus?: Map<string, Map<string, RecommendationStatus>>;
  __outsideAudit?: AuditEvent[];
};

function memStatus() {
  return (g.__outsideRecStatus ??= new Map());
}
function memAudit() {
  return (g.__outsideAudit ??= []);
}
function scopeKey(orgId: string, target: string) {
  return `${orgId}\u0000${target.toLowerCase()}`;
}

async function prisma() {
  if (!process.env.DATABASE_URL) return null;
  return database;
}

export async function getRecommendationStatuses(orgId: string, target: string): Promise<Map<string, RecommendationStatus>> {
  const key = target.toLowerCase();
  const db = await prisma();
  if (db) {
    const rows = await db.recommendationState.findMany({ where: { orgId, target: key } });
    return new Map(rows.map((row) => [row.recId, row.status as RecommendationStatus]));
  }
  return new Map(memStatus().get(scopeKey(orgId, key)) ?? []);
}

export async function setRecommendationStatus(
  orgId: string,
  target: string,
  recId: string,
  status: RecommendationStatus,
  actor: string,
): Promise<void> {
  const key = target.toLowerCase();
  const db = await prisma();
  if (db) {
    await db.recommendationState.upsert({
      where: { orgId_target_recId: { orgId, target: key, recId } },
      create: { orgId, target: key, recId, status },
      update: { status },
    });
  } else {
    const scoped = scopeKey(orgId, key);
    const statuses = memStatus().get(scoped) ?? new Map<string, RecommendationStatus>();
    statuses.set(recId, status);
    memStatus().set(scoped, statuses);
  }
  await appendAudit({ orgId, target: key, actor, action: `recommendation.${status}`, detail: recId });
}

export async function appendAudit(evt: Omit<AuditEvent, "id" | "createdAt">): Promise<void> {
  const record: AuditEvent = {
    id: crypto.randomUUID(),
    ...evt,
    createdAt: new Date().toISOString(),
  };
  const db = await prisma();
  if (db) {
    await db.auditEvent.create({ data: { orgId: evt.orgId, target: evt.target, actor: evt.actor, action: evt.action, detail: evt.detail } });
    return;
  }
  memAudit().unshift(record);
  if (memAudit().length > 500) memAudit().length = 500;
}

export async function listAudit(orgId: string, target: string, limit = 50): Promise<AuditEvent[]> {
  const key = target.toLowerCase();
  const db = await prisma();
  if (db) {
    const rows = await db.auditEvent.findMany({ where: { orgId, target: key }, orderBy: { createdAt: "desc" }, take: limit });
    return rows.map((row) => ({
      id: row.id,
      orgId: row.orgId!,
      target: row.target,
      actor: row.actor,
      action: row.action,
      detail: row.detail,
      createdAt: row.createdAt.toISOString(),
    }));
  }
  return memAudit().filter((event) => event.orgId === orgId && event.target === key).slice(0, limit);
}

const OPEN: RecommendationStatus[] = ["open", "acknowledged", "in_progress"];

export async function applyStoredRecommendationStatus(orgId: string, target: string, posture: Posture): Promise<void> {
  const statuses = await getRecommendationStatuses(orgId, target);
  if (statuses.size === 0) return;
  for (const recommendation of posture.recommendations) {
    const stored = statuses.get(recommendation.id);
    if (stored) recommendation.status = stored;
  }
  const openReduction = posture.recommendations
    .filter((recommendation) => OPEN.includes(recommendation.status))
    .reduce((sum, recommendation) => sum + recommendation.estimatedReduction, 0);
  posture.potentialScore = Math.max(0, Math.min(100, posture.currentScore + openReduction));
  const openByPriority = { critical: 0, high: 0, medium: 0, low: 0, info: 0 } as Posture["openByPriority"];
  for (const recommendation of posture.recommendations) {
    if (recommendation.status === "open") openByPriority[recommendation.priority] += 1;
  }
  posture.openByPriority = openByPriority;
}

export function __resetAegisStore(): void {
  g.__outsideRecStatus = undefined;
  g.__outsideAudit = undefined;
}
