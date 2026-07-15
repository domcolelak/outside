import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { calculateDrift } from "./drift";
import { guardianId } from "./identity";
import type { CreateChannelInput, GuardianChannelRecord, GuardianDeliveryJob, GuardianStore, QueueDeliveryInput } from "./store-model";
import type { GuardianActivity, GuardianAnalysis, GuardianChannel, GuardianDelivery, GuardianDigest, GuardianEvent, GuardianOverview, GuardianRecommendation, GuardianRecommendationStatus, GuardianSnapshot, GuardianTargetView } from "./types";

interface ModelClient {
  findMany(args: object): Promise<unknown[]>;
  findUnique(args: object): Promise<unknown | null>;
  create(args: object): Promise<unknown>;
  createMany(args: object): Promise<{ count: number }>;
  upsert(args: object): Promise<unknown>;
  updateMany(args: object): Promise<{ count: number }>;
  deleteMany(args: object): Promise<{ count: number }>;
}

interface GuardianDb {
  guardianSnapshot: ModelClient;
  guardianEvent: ModelClient;
  guardianRecommendation: ModelClient;
  guardianChannel: ModelClient;
  guardianDelivery: ModelClient;
  guardianDigest: ModelClient;
  guardianActivity: ModelClient;
}

interface SnapshotRow { orgId: string; target: string; scanId: string; observedAt: Date; exposureScore: number; metrics: unknown; inventory: unknown; checklist: unknown }
interface EventRow { id: string; orgId: string; target: string; scanId: string; type: string; category: string; severity: string; confidence: number; title: string; summary: string; why: string; affectedAssets: string[]; evidence: unknown; groupKey: string; observedAt: Date }
interface RecommendationRow { id: string; orgId: string; target: string; code: string; status: string; priority: string; confidence: number; title: string; why: string; reasoning: string; affectedAssets: string[]; evidence: unknown; suggestedReview: string; businessImpact: string; guides: unknown; firstObservedAt: Date; lastObservedAt: Date }
interface ChannelRow { id: string; orgId: string; type: string; name: string; encryptedConfig: string; destinationHint: string; enabled: boolean; createdAt: Date }
interface DeliveryRow { id: string; idempotencyKey: string; orgId: string; channelId: string | null; channelType: string; target: string; kind: string; status: string; itemCount: number; payload: unknown; attempts: number; leaseId: string | null; lastError: string | null; createdAt: Date; deliveredAt: Date | null }
interface ActivityRow { id: string; orgId: string; target: string; type: string; message: string; createdAt: Date }
interface DigestRow { content: unknown }
interface QueueMetricRow { status: string; count: bigint; oldest: Date | null }

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function snapshot(row: SnapshotRow): GuardianSnapshot {
  return { orgId: row.orgId, target: row.target, scanId: row.scanId, observedAt: row.observedAt.toISOString(), exposureScore: row.exposureScore, metrics: row.metrics as GuardianSnapshot["metrics"], inventory: row.inventory as GuardianSnapshot["inventory"], checklist: row.checklist as GuardianSnapshot["checklist"] };
}

function event(row: EventRow): GuardianEvent {
  return { ...row, type: row.type as GuardianEvent["type"], category: row.category as GuardianEvent["category"], severity: row.severity as GuardianEvent["severity"], evidence: row.evidence as GuardianEvent["evidence"], observedAt: row.observedAt.toISOString() };
}

function recommendation(row: RecommendationRow): GuardianRecommendation {
  return { ...row, status: row.status as GuardianRecommendation["status"], priority: row.priority as GuardianRecommendation["priority"], evidence: row.evidence as GuardianRecommendation["evidence"], guides: row.guides as GuardianRecommendation["guides"], firstObservedAt: row.firstObservedAt.toISOString(), lastObservedAt: row.lastObservedAt.toISOString() };
}

function channel(row: ChannelRow, includeSecret = false): GuardianChannel | GuardianChannelRecord {
  const base: GuardianChannel = { id: row.id, orgId: row.orgId, type: row.type as GuardianChannel["type"], name: row.name, enabled: row.enabled, destinationHint: row.destinationHint, createdAt: row.createdAt.toISOString() };
  return includeSecret ? { ...base, encryptedConfig: row.encryptedConfig } : base;
}

function delivery(row: DeliveryRow): GuardianDelivery {
  return { id: row.id, orgId: row.orgId, channelId: row.channelId, channelType: row.channelType as GuardianDelivery["channelType"], target: row.target, kind: row.kind as GuardianDelivery["kind"], status: row.status as GuardianDelivery["status"], itemCount: row.itemCount, attempts: row.attempts, lastError: row.lastError, createdAt: row.createdAt.toISOString(), deliveredAt: row.deliveredAt?.toISOString() ?? null };
}

function activity(row: ActivityRow): GuardianActivity {
  return { id: row.id, orgId: row.orgId, target: row.target, type: row.type as GuardianActivity["type"], message: row.message, createdAt: row.createdAt.toISOString() };
}

export class PrismaGuardianStore implements GuardianStore {
  readonly durable = true;
  private db = prisma as unknown as GuardianDb;

  async history(orgId: string, target: string, limit = 32) {
    const rows = await this.db.guardianSnapshot.findMany({ where: { orgId, target }, orderBy: { observedAt: "desc" }, take: limit }) as SnapshotRow[];
    return rows.map(snapshot).reverse();
  }

  async events(orgId: string, target?: string, limit = 200) {
    const rows = await this.db.guardianEvent.findMany({ where: { orgId, ...(target ? { target } : {}) }, orderBy: { observedAt: "desc" }, take: limit }) as EventRow[];
    return rows.map(event);
  }

  async recommendations(orgId: string, target?: string) {
    const rows = await this.db.guardianRecommendation.findMany({ where: { orgId, ...(target ? { target } : {}) }, orderBy: [{ priority: "desc" }, { lastObservedAt: "desc" }] }) as RecommendationRow[];
    return rows.map(recommendation);
  }

  async saveAnalysis(analysis: GuardianAnalysis) {
    await prisma.$transaction(async (transaction) => {
      const db = transaction as unknown as GuardianDb;
      const current = analysis.snapshot;
      await db.guardianSnapshot.createMany({
        data: [{ id: guardianId("guardian-snapshot", current.orgId, current.scanId), orgId: current.orgId, scanId: current.scanId, target: current.target, observedAt: new Date(current.observedAt), exposureScore: current.exposureScore, metrics: json(current.metrics), inventory: json(current.inventory), checklist: json(current.checklist) }],
        skipDuplicates: true,
      });
      if (analysis.events.length) await db.guardianEvent.createMany({ data: analysis.events.map((row) => ({ ...row, observedAt: new Date(row.observedAt), evidence: json(row.evidence) })), skipDuplicates: true });
      for (const row of analysis.recommendations) {
        await db.guardianRecommendation.upsert({
          where: { orgId_target_code: { orgId: row.orgId, target: row.target, code: row.code } },
          create: { ...row, evidence: json(row.evidence), guides: json(row.guides), firstObservedAt: new Date(row.firstObservedAt), lastObservedAt: new Date(row.lastObservedAt) },
          update: { status: row.status, priority: row.priority, confidence: row.confidence, title: row.title, why: row.why, reasoning: row.reasoning, affectedAssets: row.affectedAssets, evidence: json(row.evidence), suggestedReview: row.suggestedReview, businessImpact: row.businessImpact, guides: json(row.guides), lastObservedAt: new Date(row.lastObservedAt) },
        });
      }
      const codes = analysis.recommendations.map((row) => row.code);
      await db.guardianRecommendation.updateMany({ where: { orgId: current.orgId, target: current.target, status: { notIn: ["dismissed", "resolved"] }, ...(codes.length ? { code: { notIn: codes } } : {}) }, data: { status: "resolved", lastObservedAt: new Date(current.observedAt) } });
      const activities = [
        { type: "scan_analyzed", message: `Analyzed scan ${current.scanId} with ${current.metrics.assets} observable assets.` },
        ...(analysis.events.length ? [{ type: "events_correlated", message: `Correlated ${analysis.events.length} meaningful change event(s).` }] : []),
      ];
      await db.guardianActivity.createMany({ data: activities.map((row) => ({ id: guardianId("guardian-activity", current.orgId, current.target, row.type, current.scanId), orgId: current.orgId, target: current.target, type: row.type, message: row.message, createdAt: new Date(current.observedAt) })), skipDuplicates: true });
    });
  }

  async updateRecommendation(orgId: string, id: string, status: GuardianRecommendationStatus, actor: string) {
    const rows = await this.db.guardianRecommendation.findMany({ where: { id, orgId }, take: 1 }) as RecommendationRow[];
    const row = rows[0];
    if (!row) return false;
    const result = await this.db.guardianRecommendation.updateMany({ where: { id, orgId }, data: { status } });
    if (!result.count) return false;
    const now = new Date();
    await this.db.guardianActivity.create({ data: { id: guardianId("guardian-activity", orgId, id, status, now.toISOString()), orgId, target: row.target, type: "recommendation_updated", message: `${actor} changed “${row.title}” to ${status}.`, createdAt: now } });
    return true;
  }

  async overview(orgId: string): Promise<GuardianOverview> {
    const rows = (await this.db.guardianSnapshot.findMany({ where: { orgId }, orderBy: { observedAt: "desc" }, take: 512 }) as SnapshotRow[]).reverse();
    const groups = new Map<string, GuardianSnapshot[]>();
    for (const row of rows.map(snapshot)) groups.set(row.target, [...(groups.get(row.target) ?? []), row]);
    const targetViews: GuardianTargetView[] = [];
    for (const [target, history] of groups) {
      const latest = history.at(-1);
      if (!latest) continue;
      targetViews.push({ target, latest, history: history.slice(-32), drift: calculateDrift(history.slice(0, -1), latest), events: await this.events(orgId, target, 100), recommendations: await this.recommendations(orgId, target) });
    }
    const [recentEvents, recommendations, deliveries, activities, channels] = await Promise.all([
      this.events(orgId, undefined, 100), this.recommendations(orgId),
      this.db.guardianDelivery.findMany({ where: { orgId }, orderBy: { createdAt: "desc" }, take: 50 }) as Promise<DeliveryRow[]>,
      this.activity(orgId), this.channels(orgId),
    ]);
    return { orgId, generatedAt: new Date().toISOString(), targets: targetViews, recentEvents, recommendations, deliveries: deliveries.map(delivery), activity: activities, channels: channels as GuardianChannel[], durable: true };
  }

  async channels(orgId: string, includeSecrets = false) {
    const rows = await this.db.guardianChannel.findMany({ where: { orgId }, orderBy: { createdAt: "asc" } }) as ChannelRow[];
    return rows.map((row) => channel(row, includeSecrets));
  }

  async createChannel(input: CreateChannelInput) {
    const row = await this.db.guardianChannel.create({ data: { ...input } }) as ChannelRow;
    return channel(row) as GuardianChannel;
  }

  async setChannelEnabled(orgId: string, id: string, enabled: boolean) {
    return (await this.db.guardianChannel.updateMany({ where: { id, orgId }, data: { enabled } })).count === 1;
  }

  async deleteChannel(orgId: string, id: string) {
    return (await this.db.guardianChannel.deleteMany({ where: { id, orgId } })).count === 1;
  }

  async queueDelivery(input: QueueDeliveryInput) {
    const row = await this.db.guardianDelivery.upsert({ where: { idempotencyKey: input.idempotencyKey }, update: {}, create: { ...input, payload: json(input.payload) } }) as DeliveryRow;
    await this.db.guardianActivity.createMany({
      data: [{ id: guardianId("guardian-activity", input.orgId, input.idempotencyKey), orgId: input.orgId, target: input.target, type: "notification_queued", message: `Queued ${input.kind.replace("_", " ")} for ${input.channelType}.`, createdAt: row.createdAt }],
      skipDuplicates: true,
    });
    return delivery(row);
  }

  async queueMetrics(now: Date) {
    const rows = await prisma.$queryRaw<QueueMetricRow[]>`
      SELECT "status", COUNT(*)::bigint AS count, MIN("createdAt") AS oldest
      FROM "guardian_deliveries"
      WHERE "status" IN ('pending', 'retry', 'sending')
      GROUP BY "status"
    `;
    const count = (status: string) => Number(rows.find((row) => row.status === status)?.count ?? 0n);
    const readyOldest = await prisma.$queryRaw<Array<{ oldest: Date | null }>>`
      SELECT MIN("createdAt") AS oldest FROM "guardian_deliveries"
      WHERE "status" IN ('pending', 'retry') AND "nextAttemptAt" <= ${now}
    `;
    const oldest = readyOldest[0]?.oldest;
    return { pending: count("pending"), retry: count("retry"), sending: count("sending"), oldestReadyAgeSeconds: oldest ? Math.max(0, now.getTime() - oldest.getTime()) / 1_000 : 0 };
  }

  async claimDeliveries(now: Date, limit: number, leaseMs: number) {
    const leaseId = randomUUID();
    const leasedUntil = new Date(now.getTime() + leaseMs);
    const rows = await prisma.$queryRaw<DeliveryRow[]>(Prisma.sql`
      UPDATE "guardian_deliveries" SET "status" = 'sending', "attempts" = "attempts" + 1,
        "leaseId" = ${leaseId}, "leasedUntil" = ${leasedUntil}
      WHERE "id" IN (
        SELECT "id" FROM "guardian_deliveries"
        WHERE "status" IN ('pending', 'retry') AND "nextAttemptAt" <= ${now}
          AND ("leasedUntil" IS NULL OR "leasedUntil" <= ${now})
        ORDER BY "nextAttemptAt" ASC FOR UPDATE SKIP LOCKED LIMIT ${limit}
      ) RETURNING *
    `);
    const secrets = new Map((await this.channelsForIds(rows.flatMap((row) => row.channelId ? [row.channelId] : []))).map((row) => [row.id, row.encryptedConfig]));
    return rows.map((row): GuardianDeliveryJob => ({ ...delivery(row), payload: row.payload, leaseId, encryptedConfig: row.channelId ? secrets.get(row.channelId) ?? null : null }));
  }

  async completeDelivery(id: string, leaseId: string, at: Date) {
    return (await this.db.guardianDelivery.updateMany({ where: { id, leaseId, status: "sending" }, data: { status: "sent", deliveredAt: at, leaseId: null, leasedUntil: null } })).count === 1;
  }

  async failDelivery(id: string, leaseId: string, error: string, retryAt: Date) {
    const rows = await this.db.guardianDelivery.findMany({ where: { id, leaseId }, take: 1 }) as DeliveryRow[];
    const row = rows[0];
    if (!row) return false;
    return (await this.db.guardianDelivery.updateMany({ where: { id, leaseId }, data: { status: row.attempts >= 5 ? "failed" : "retry", lastError: error.slice(0, 1_000), nextAttemptAt: retryAt, leaseId: null, leasedUntil: null } })).count === 1;
  }

  async saveDigest(digest: GuardianDigest) {
    const result = await this.db.guardianDigest.createMany({ data: [{ orgId: digest.orgId, target: digest.target, weekOf: new Date(digest.weekOf), generatedAt: new Date(digest.generatedAt), content: json(digest) }], skipDuplicates: true });
    if (result.count) await this.db.guardianActivity.create({ data: { id: guardianId("guardian-activity", digest.orgId, digest.target, "digest", digest.weekOf), orgId: digest.orgId, target: digest.target, type: "digest_generated", message: `Generated weekly digest for ${digest.weekOf}.`, createdAt: new Date(digest.generatedAt) } });
    return result.count === 1;
  }

  async digests(orgId: string, target?: string, limit = 12) {
    const rows = await this.db.guardianDigest.findMany({ where: { orgId, ...(target ? { target } : {}) }, orderBy: { generatedAt: "desc" }, take: limit }) as DigestRow[];
    return rows.map((row) => row.content as GuardianDigest);
  }

  async activity(orgId: string, limit = 100) {
    const rows = await this.db.guardianActivity.findMany({ where: { orgId }, orderBy: { createdAt: "desc" }, take: limit }) as ActivityRow[];
    return rows.map(activity);
  }

  private async channelsForIds(ids: string[]) {
    if (!ids.length) return [];
    return await this.db.guardianChannel.findMany({ where: { id: { in: ids }, enabled: true } }) as ChannelRow[];
  }
}
