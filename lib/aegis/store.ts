/**
 * Aegis state: recommendation status ("resolved", "dismissed", …) and an audit
 * trail. This is the "Improve" / historical-learning layer — once a user
 * resolves a recommendation it stays resolved across future scans, and the
 * posture reflects real progress rather than re-nagging.
 *
 * Zero-config in-memory by default (cached on globalThis so every route bundle
 * shares it); durable via Prisma when DATABASE_URL is set. Every status change
 * is written to the audit trail.
 */

import type { AuditEvent, Posture, RecommendationStatus } from "./types";

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

async function prisma() {
  if (!process.env.DATABASE_URL) return null;
  try {
    const { PrismaClient } = await import("@prisma/client");
    const gp = globalThis as unknown as { __outsidePrisma?: InstanceType<typeof PrismaClient> };
    const client = gp.__outsidePrisma ?? new PrismaClient();
    if (process.env.NODE_ENV !== "production") gp.__outsidePrisma = client;
    return client;
  } catch {
    return null;
  }
}

export async function getRecommendationStatuses(target: string): Promise<Map<string, RecommendationStatus>> {
  const key = target.toLowerCase();
  const db = await prisma();
  if (db) {
    const rows = await db.recommendationState.findMany({ where: { target: key } });
    return new Map(rows.map((r) => [r.recId, r.status as RecommendationStatus]));
  }
  return new Map(memStatus().get(key) ?? []);
}

export async function setRecommendationStatus(
  target: string,
  recId: string,
  status: RecommendationStatus,
  actor?: string,
): Promise<void> {
  const key = target.toLowerCase();
  const db = await prisma();
  if (db) {
    await db.recommendationState.upsert({
      where: { target_recId: { target: key, recId } },
      create: { target: key, recId, status },
      update: { status },
    });
  } else {
    const map = memStatus().get(key) ?? new Map<string, RecommendationStatus>();
    map.set(recId, status);
    memStatus().set(key, map);
  }
  await appendAudit({ target: key, actor: actor ?? null, action: `recommendation.${status}`, detail: recId });
}

export async function appendAudit(evt: { target: string | null; actor: string | null; action: string; detail: string | null }): Promise<void> {
  const record: AuditEvent = {
    id: `aud_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    ...evt,
    createdAt: new Date().toISOString(),
  };
  const db = await prisma();
  if (db) {
    await db.auditEvent.create({ data: { target: evt.target, actor: evt.actor, action: evt.action, detail: evt.detail } });
    return;
  }
  memAudit().unshift(record);
  if (memAudit().length > 500) memAudit().length = 500;
}

export async function listAudit(target: string, limit = 50): Promise<AuditEvent[]> {
  const key = target.toLowerCase();
  const db = await prisma();
  if (db) {
    const rows = await db.auditEvent.findMany({ where: { target: key }, orderBy: { createdAt: "desc" }, take: limit });
    return rows.map((r) => ({ id: r.id, target: r.target, actor: r.actor, action: r.action, detail: r.detail, createdAt: r.createdAt.toISOString() }));
  }
  return memAudit().filter((a) => a.target === key).slice(0, limit);
}

const OPEN: RecommendationStatus[] = ["open", "acknowledged", "in_progress"];

/**
 * Overlay stored statuses onto a freshly-built posture and recompute the
 * potential score so resolved/dismissed items no longer count toward the gain.
 */
export async function applyStoredRecommendationStatus(target: string, posture: Posture): Promise<void> {
  const statuses = await getRecommendationStatuses(target);
  if (statuses.size === 0) return;
  for (const rec of posture.recommendations) {
    const stored = statuses.get(rec.id);
    if (stored) rec.status = stored;
  }
  const openReduction = posture.recommendations
    .filter((r) => OPEN.includes(r.status))
    .reduce((sum, r) => sum + r.estimatedReduction, 0);
  posture.potentialScore = Math.max(0, Math.min(100, posture.currentScore + openReduction));
  const openByPriority = { critical: 0, high: 0, medium: 0, low: 0, info: 0 } as Posture["openByPriority"];
  for (const r of posture.recommendations) if (r.status === "open") openByPriority[r.priority] += 1;
  posture.openByPriority = openByPriority;
}
