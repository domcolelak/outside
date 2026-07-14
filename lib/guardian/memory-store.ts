import { randomUUID } from "node:crypto";
import { calculateDrift } from "./drift";
import { guardianId } from "./identity";
import type { CreateChannelInput, GuardianChannelRecord, GuardianDeliveryJob, GuardianStore, QueueDeliveryInput } from "./store-model";
import type { GuardianActivity, GuardianAnalysis, GuardianChannel, GuardianDelivery, GuardianDigest, GuardianEvent, GuardianOverview, GuardianRecommendation, GuardianRecommendationStatus, GuardianSnapshot, GuardianTargetView } from "./types";

interface StoredDelivery extends GuardianDelivery {
  idempotencyKey: string;
  payload: unknown;
  leaseId: string | null;
  leasedUntil: string | null;
  nextAttemptAt: string;
}

export class InMemoryGuardianStore implements GuardianStore {
  readonly durable = false;
  private snapshots: GuardianSnapshot[] = [];
  private eventRows: GuardianEvent[] = [];
  private recommendationRows: GuardianRecommendation[] = [];
  private channelRows: GuardianChannelRecord[] = [];
  private deliveryRows: StoredDelivery[] = [];
  private digestRows: GuardianDigest[] = [];
  private activityRows: GuardianActivity[] = [];

  async history(orgId: string, target: string, limit = 32) {
    return this.snapshots.filter((row) => row.orgId === orgId && row.target === target).sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt)).slice(-limit);
  }

  async events(orgId: string, target?: string, limit = 200) {
    return this.eventRows.filter((row) => row.orgId === orgId && (!target || row.target === target)).sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt)).slice(0, limit);
  }

  async recommendations(orgId: string, target?: string) {
    return this.recommendationRows.filter((row) => row.orgId === orgId && (!target || row.target === target));
  }

  async saveAnalysis(analysis: GuardianAnalysis) {
    if (this.snapshots.some((row) => row.scanId === analysis.snapshot.scanId)) return;
    this.snapshots.push(structuredClone(analysis.snapshot));
    this.eventRows.push(...structuredClone(analysis.events));
    for (const recommendation of analysis.recommendations) {
      const index = this.recommendationRows.findIndex((row) => row.orgId === recommendation.orgId && row.target === recommendation.target && row.code === recommendation.code);
      if (index === -1) this.recommendationRows.push(structuredClone(recommendation));
      else this.recommendationRows[index] = { ...structuredClone(recommendation), id: this.recommendationRows[index]!.id, firstObservedAt: this.recommendationRows[index]!.firstObservedAt };
    }
    const activeCodes = new Set(analysis.recommendations.map((row) => row.code));
    this.recommendationRows = this.recommendationRows.map((row) => row.orgId === analysis.snapshot.orgId && row.target === analysis.snapshot.target && row.status !== "dismissed" && !activeCodes.has(row.code) ? { ...row, status: "resolved", lastObservedAt: analysis.snapshot.observedAt } : row);
    this.addActivity(analysis.snapshot.orgId, analysis.snapshot.target, "scan_analyzed", `Analyzed scan ${analysis.snapshot.scanId} with ${analysis.snapshot.metrics.assets} observable assets.`, analysis.snapshot.observedAt);
    if (analysis.events.length) this.addActivity(analysis.snapshot.orgId, analysis.snapshot.target, "events_correlated", `Correlated ${analysis.events.length} meaningful change event(s).`, analysis.snapshot.observedAt);
  }

  async updateRecommendation(orgId: string, id: string, status: GuardianRecommendationStatus, actor: string) {
    const row = this.recommendationRows.find((item) => item.orgId === orgId && item.id === id);
    if (!row) return false;
    row.status = status;
    row.lastObservedAt = new Date().toISOString();
    this.addActivity(orgId, row.target, "recommendation_updated", `${actor} changed “${row.title}” to ${status}.`);
    return true;
  }

  async overview(orgId: string): Promise<GuardianOverview> {
    const targets = [...new Set(this.snapshots.filter((row) => row.orgId === orgId).map((row) => row.target))];
    const targetViews: GuardianTargetView[] = [];
    for (const target of targets) {
      const history = await this.history(orgId, target);
      const latest = history.at(-1);
      if (!latest) continue;
      targetViews.push({ target, latest, history, drift: calculateDrift(history.slice(0, -1), latest), events: await this.events(orgId, target, 100), recommendations: await this.recommendations(orgId, target) });
    }
    return { orgId, generatedAt: new Date().toISOString(), targets: targetViews, recentEvents: await this.events(orgId, undefined, 100), recommendations: await this.recommendations(orgId), deliveries: this.deliveryRows.filter((row) => row.orgId === orgId).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 50).map(this.publicDelivery), activity: await this.activity(orgId), channels: await this.channels(orgId) as GuardianChannel[], durable: false };
  }

  async channels(orgId: string, includeSecrets = false) {
    const rows = this.channelRows.filter((row) => row.orgId === orgId);
    return includeSecrets ? structuredClone(rows) : rows.map(({ encryptedConfig: _secret, ...row }) => { void _secret; return structuredClone(row); });
  }

  async createChannel(input: CreateChannelInput) {
    const row: GuardianChannelRecord = { id: randomUUID(), ...input, enabled: true, createdAt: new Date().toISOString() };
    this.channelRows.push(row);
    const { encryptedConfig: _secret, ...publicRow } = row;
    void _secret;
    return publicRow;
  }

  async setChannelEnabled(orgId: string, id: string, enabled: boolean) {
    const row = this.channelRows.find((item) => item.orgId === orgId && item.id === id);
    if (!row) return false;
    row.enabled = enabled;
    return true;
  }

  async deleteChannel(orgId: string, id: string) {
    const index = this.channelRows.findIndex((item) => item.orgId === orgId && item.id === id);
    if (index < 0) return false;
    this.channelRows.splice(index, 1);
    return true;
  }

  async queueDelivery(input: QueueDeliveryInput) {
    const existing = this.deliveryRows.find((row) => row.idempotencyKey === input.idempotencyKey);
    if (existing) return this.publicDelivery(existing);
    const createdAt = new Date().toISOString();
    const row: StoredDelivery = { id: randomUUID(), ...input, status: "pending", attempts: 0, lastError: null, createdAt, deliveredAt: null, payload: structuredClone(input.payload), leaseId: null, leasedUntil: null, nextAttemptAt: createdAt };
    this.deliveryRows.push(row);
    this.addActivity(input.orgId, input.target, "notification_queued", `Queued ${input.kind.replace("_", " ")} for ${input.channelType}.`);
    return this.publicDelivery(row);
  }

  async claimDeliveries(now: Date, limit: number, leaseMs: number) {
    const jobs: GuardianDeliveryJob[] = [];
    for (const row of this.deliveryRows) {
      if (jobs.length >= limit) break;
      if (!(["pending", "retry"].includes(row.status)) || Date.parse(row.nextAttemptAt) > now.getTime() || (row.leasedUntil && Date.parse(row.leasedUntil) > now.getTime())) continue;
      row.status = "sending";
      row.attempts += 1;
      row.leaseId = randomUUID();
      row.leasedUntil = new Date(now.getTime() + leaseMs).toISOString();
      const encryptedConfig = row.channelId ? this.channelRows.find((channel) => channel.id === row.channelId && channel.enabled)?.encryptedConfig ?? null : null;
      jobs.push({ ...this.publicDelivery(row), payload: structuredClone(row.payload), leaseId: row.leaseId, encryptedConfig });
    }
    return jobs;
  }

  async completeDelivery(id: string, leaseId: string, at: Date) {
    const row = this.deliveryRows.find((item) => item.id === id && item.leaseId === leaseId);
    if (!row) return false;
    row.status = "sent"; row.deliveredAt = at.toISOString(); row.leaseId = null; row.leasedUntil = null;
    return true;
  }

  async failDelivery(id: string, leaseId: string, error: string, retryAt: Date) {
    const row = this.deliveryRows.find((item) => item.id === id && item.leaseId === leaseId);
    if (!row) return false;
    row.status = row.attempts >= 5 ? "failed" : "retry"; row.lastError = error.slice(0, 1_000); row.nextAttemptAt = retryAt.toISOString(); row.leaseId = null; row.leasedUntil = null;
    return true;
  }

  async saveDigest(digest: GuardianDigest) {
    if (this.digestRows.some((row) => row.orgId === digest.orgId && row.target === digest.target && row.weekOf === digest.weekOf)) return false;
    this.digestRows.push(structuredClone(digest));
    this.addActivity(digest.orgId, digest.target, "digest_generated", `Generated weekly digest for ${digest.weekOf}.`, digest.generatedAt);
    return true;
  }

  async digests(orgId: string, target?: string, limit = 12) {
    return this.digestRows.filter((row) => row.orgId === orgId && (!target || row.target === target)).sort((a, b) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt)).slice(0, limit);
  }

  async activity(orgId: string, limit = 100) {
    return this.activityRows.filter((row) => row.orgId === orgId).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, limit);
  }

  private publicDelivery = (row: StoredDelivery): GuardianDelivery => ({ id: row.id, orgId: row.orgId, channelId: row.channelId, channelType: row.channelType, target: row.target, kind: row.kind, status: row.status, itemCount: row.itemCount, attempts: row.attempts, lastError: row.lastError, createdAt: row.createdAt, deliveredAt: row.deliveredAt });

  private addActivity(orgId: string, target: string, type: GuardianActivity["type"], message: string, createdAt = new Date().toISOString()) {
    this.activityRows.push({ id: guardianId("guardian-activity", orgId, target, type, createdAt, message), orgId, target, type, message, createdAt });
  }
}
