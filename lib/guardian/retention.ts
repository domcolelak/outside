import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { recordRetentionMetrics } from "@/lib/observability/metrics";

export interface GuardianRetentionPolicy {
  orgId: string;
  scanDays: number;
  snapshotDays: number;
  eventDays: number;
  deliveryDays: number;
  activityDays: number;
  digestDays: number;
  updatedAt: string;
}

export type RetentionValues = Omit<GuardianRetentionPolicy, "orgId" | "updatedAt">;

export const RETENTION_BOUNDS: Record<keyof RetentionValues, { min: number; max: number }> = {
  scanDays: { min: 30, max: 1825 },
  snapshotDays: { min: 30, max: 1095 },
  eventDays: { min: 30, max: 1095 },
  deliveryDays: { min: 7, max: 365 },
  activityDays: { min: 30, max: 730 },
  digestDays: { min: 90, max: 1825 },
};

interface PolicyRow extends RetentionValues { orgId: string; updatedAt: Date }

function mapPolicy(row: PolicyRow): GuardianRetentionPolicy {
  return { ...row, updatedAt: row.updatedAt.toISOString() };
}

export function validateRetentionValues(value: unknown): RetentionValues {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Retention policy must be an object.");
  const input = value as Record<string, unknown>;
  const output = {} as RetentionValues;
  for (const [key, bounds] of Object.entries(RETENTION_BOUNDS) as Array<[keyof RetentionValues, { min: number; max: number }]>) {
    const candidate = input[key];
    if (!Number.isInteger(candidate) || Number(candidate) < bounds.min || Number(candidate) > bounds.max) throw new Error(`${key} must be an integer between ${bounds.min} and ${bounds.max}.`);
    output[key] = Number(candidate);
  }
  if (output.scanDays < output.snapshotDays) throw new Error("scanDays cannot be shorter than snapshotDays because Guardian snapshots reference scans.");
  return output;
}

export async function getRetentionPolicy(orgId: string): Promise<GuardianRetentionPolicy | null> {
  const rows = await prisma.$queryRaw<PolicyRow[]>`SELECT * FROM "guardian_retention_policies" WHERE "orgId" = ${orgId} LIMIT 1`;
  return rows[0] ? mapPolicy(rows[0]) : null;
}

export async function setRetentionPolicy(orgId: string, values: RetentionValues): Promise<GuardianRetentionPolicy> {
  const rows = await prisma.$queryRaw<PolicyRow[]>`
    INSERT INTO "guardian_retention_policies" ("orgId", "scanDays", "snapshotDays", "eventDays", "deliveryDays", "activityDays", "digestDays", "updatedAt")
    VALUES (${orgId}, ${values.scanDays}, ${values.snapshotDays}, ${values.eventDays}, ${values.deliveryDays}, ${values.activityDays}, ${values.digestDays}, NOW())
    ON CONFLICT ("orgId") DO UPDATE SET
      "scanDays" = EXCLUDED."scanDays", "snapshotDays" = EXCLUDED."snapshotDays", "eventDays" = EXCLUDED."eventDays",
      "deliveryDays" = EXCLUDED."deliveryDays", "activityDays" = EXCLUDED."activityDays", "digestDays" = EXCLUDED."digestDays", "updatedAt" = NOW()
    RETURNING *
  `;
  return mapPolicy(rows[0]!);
}

export interface RetentionRunResult {
  acquired: boolean;
  organizations: number;
  deleted: Record<"scans" | "snapshots" | "evidence" | "events" | "deliveries" | "activity" | "digests", number>;
  saturated: boolean;
  durationMs: number;
}

/** Bounded, tenant-aware cleanup. Each delete uses SKIP LOCKED and a small batch. */
export async function runGuardianRetention(now = new Date(), batchSize = 2_000, maxBatches = 10): Promise<RetentionRunResult> {
  const started = Date.now();
  if (!Number.isInteger(batchSize) || batchSize < 100 || batchSize > 10_000) throw new Error("Retention batchSize must be between 100 and 10000.");
  if (!Number.isInteger(maxBatches) || maxBatches < 1 || maxBatches > 100) throw new Error("Retention maxBatches must be between 1 and 100.");
  const result = await prisma.$transaction(async (tx) => {
    const lock = await tx.$queryRaw<Array<{ acquired: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtext('outside:guardian:retention')) AS acquired`;
    if (!lock[0]?.acquired) return { acquired: false, organizations: 0, deleted: { scans: 0, snapshots: 0, evidence: 0, events: 0, deliveries: 0, activity: 0, digests: 0 }, saturated: false, durationMs: Date.now() - started };
    // The maintenance function returns PostgreSQL `void`; execute it without
    // asking Prisma to deserialize that unsupported pseudo-type.
    await tx.$executeRaw`SELECT guardian_ensure_monthly_partitions(${now}, 1, 12)`;
    await tx.$executeRaw`
      INSERT INTO "guardian_retention_policies" ("orgId", "scanDays", "snapshotDays", "eventDays", "deliveryDays", "activityDays", "digestDays", "updatedAt")
      SELECT "id",
        CASE WHEN "plan" = 'agency'::"Plan" THEN 1825 ELSE 730 END,
        CASE WHEN "plan" = 'agency'::"Plan" THEN 1095 ELSE 365 END,
        CASE WHEN "plan" = 'agency'::"Plan" THEN 1095 ELSE 365 END,
        CASE WHEN "plan" = 'agency'::"Plan" THEN 180 ELSE 90 END,
        CASE WHEN "plan" = 'agency'::"Plan" THEN 365 ELSE 180 END,
        CASE WHEN "plan" = 'agency'::"Plan" THEN 1095 ELSE 730 END,
        NOW()
      FROM "organizations" WHERE "plan" <> 'free'::"Plan"
      ON CONFLICT ("orgId") DO NOTHING
    `;
    const policyCount = await tx.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "guardian_retention_policies"`;
    const deleted = { scans: 0, snapshots: 0, evidence: 0, events: 0, deliveries: 0, activity: 0, digests: 0 };
    let saturated = false;

    const drain = async (operation: () => Promise<number>, bucket: keyof typeof deleted) => {
      for (let iteration = 0; iteration < maxBatches; iteration += 1) {
        const count = await operation();
        deleted[bucket] += count;
        if (count < batchSize) return;
      }
      saturated = true;
    };

    await drain(() => tx.$executeRaw(Prisma.sql`WITH doomed AS (SELECT item."id", item."observedAt" FROM "guardian_events" item JOIN "guardian_retention_policies" policy ON policy."orgId" = item."orgId" WHERE item."observedAt" < ${now}::timestamp - policy."eventDays" * INTERVAL '1 day' ORDER BY item."observedAt" LIMIT ${batchSize} FOR UPDATE OF item SKIP LOCKED) DELETE FROM "guardian_events" item USING doomed WHERE item."id" = doomed."id" AND item."observedAt" = doomed."observedAt"`), "events");
    await drain(() => tx.$executeRaw(Prisma.sql`WITH doomed AS (SELECT item."id", item."observedAt" FROM "guardian_evidence_snapshots" item JOIN "guardian_retention_policies" policy ON policy."orgId" = item."orgId" WHERE item."observedAt" < ${now}::timestamp - policy."snapshotDays" * INTERVAL '1 day' ORDER BY item."observedAt" LIMIT ${batchSize} FOR UPDATE OF item SKIP LOCKED) DELETE FROM "guardian_evidence_snapshots" item USING doomed WHERE item."id" = doomed."id" AND item."observedAt" = doomed."observedAt"`), "evidence");
    await drain(() => tx.$executeRaw(Prisma.sql`WITH doomed AS (SELECT item."id", item."observedAt" FROM "guardian_snapshots" item JOIN "guardian_retention_policies" policy ON policy."orgId" = item."orgId" WHERE item."observedAt" < ${now}::timestamp - policy."snapshotDays" * INTERVAL '1 day' ORDER BY item."observedAt" LIMIT ${batchSize} FOR UPDATE OF item SKIP LOCKED) DELETE FROM "guardian_snapshots" item USING doomed WHERE item."id" = doomed."id" AND item."observedAt" = doomed."observedAt"`), "snapshots");
    await drain(() => tx.$executeRaw(Prisma.sql`WITH doomed AS (SELECT item."id" FROM "guardian_deliveries" item JOIN "guardian_retention_policies" policy ON policy."orgId" = item."orgId" WHERE item."createdAt" < ${now}::timestamp - policy."deliveryDays" * INTERVAL '1 day' ORDER BY item."createdAt" LIMIT ${batchSize} FOR UPDATE OF item SKIP LOCKED) DELETE FROM "guardian_deliveries" item USING doomed WHERE item."id" = doomed."id"`), "deliveries");
    await drain(() => tx.$executeRaw(Prisma.sql`WITH doomed AS (SELECT item."id", item."createdAt" FROM "guardian_activity" item JOIN "guardian_retention_policies" policy ON policy."orgId" = item."orgId" WHERE item."createdAt" < ${now}::timestamp - policy."activityDays" * INTERVAL '1 day' ORDER BY item."createdAt" LIMIT ${batchSize} FOR UPDATE OF item SKIP LOCKED) DELETE FROM "guardian_activity" item USING doomed WHERE item."id" = doomed."id" AND item."createdAt" = doomed."createdAt"`), "activity");
    await drain(() => tx.$executeRaw(Prisma.sql`WITH doomed AS (SELECT item."id" FROM "guardian_digests" item JOIN "guardian_retention_policies" policy ON policy."orgId" = item."orgId" WHERE item."generatedAt" < ${now}::timestamp - policy."digestDays" * INTERVAL '1 day' ORDER BY item."generatedAt" LIMIT ${batchSize} FOR UPDATE OF item SKIP LOCKED) DELETE FROM "guardian_digests" item USING doomed WHERE item."id" = doomed."id"`), "digests");
    await drain(() => tx.$executeRaw(Prisma.sql`WITH doomed AS (SELECT item."id" FROM "scans" item JOIN "guardian_retention_policies" policy ON policy."orgId" = item."orgId" WHERE item."finishedAt" < ${now}::timestamp - policy."scanDays" * INTERVAL '1 day' ORDER BY item."finishedAt" LIMIT ${batchSize} FOR UPDATE OF item SKIP LOCKED) DELETE FROM "scans" item USING doomed WHERE item."id" = doomed."id"`), "scans");
    return { acquired: true, organizations: Number(policyCount[0]?.count ?? 0n), deleted, saturated, durationMs: Date.now() - started };
  }, { timeout: 120_000 });
  const completed = { ...result, durationMs: Date.now() - started };
  recordRetentionMetrics(completed);
  return completed;
}
