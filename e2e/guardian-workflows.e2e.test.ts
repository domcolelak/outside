import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import type { Asset, ScanResult } from "@/lib/types";
import { analyzeGuardianScan } from "@/lib/guardian/analyze";
import { encryptGuardianConfig } from "@/lib/guardian/crypto";
import { createWeeklyDigest } from "@/lib/guardian/digest";
import { PrismaGuardianStore } from "@/lib/guardian/prisma-store";
import { runGuardianRetention, setRetentionPolicy } from "@/lib/guardian/retention";

const ORG_A = "e2e_guardian_a";
const ORG_B = "e2e_guardian_b";
const TARGET_A = "e2e_target_a";
const TARGET_B = "e2e_target_b";
const DOMAIN_A = "guardian-a.example";
const DOMAIN_B = "guardian-b.example";
const store = new PrismaGuardianStore();

function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 86_400_000);
}

function rootAsset(observedAt: Date): Asset {
  const timestamp = observedAt.toISOString();
  return {
    id: `asset-${DOMAIN_A}`,
    kind: "root_domain",
    label: DOMAIN_A,
    canonical: DOMAIN_A,
    firstObservedAt: timestamp,
    lastObservedAt: timestamp,
    discoveredVia: ["dns", "http_observation"],
    evidence: [{ method: "dns", provider: "E2E DNS", summary: `${DOMAIN_A} resolves publicly`, observedAt: timestamp }],
    signals: [],
    priority: "high",
    orgConfidence: 1,
    attrs: {
      addresses: ["203.0.113.10"],
      protocols: ["HTTPS"],
      certNotAfter: new Date(observedAt.getTime() + 10 * 86_400_000).toISOString(),
      certDaysToExpiry: 10,
      domainExpiresAt: new Date(observedAt.getTime() + 12 * 86_400_000).toISOString(),
      domainDaysToExpiry: 12,
    },
  };
}

function scanResult(id: string, observedAt: Date): ScanResult {
  const asset = rootAsset(observedAt);
  return {
    scanId: id,
    target: DOMAIN_A,
    mode: "passive",
    isDemo: false,
    startedAt: new Date(observedAt.getTime() - 60_000).toISOString(),
    finishedAt: observedAt.toISOString(),
    graph: { assets: [asset], edges: [] },
    findings: [],
    score: { value: 61, band: "elevated", components: [], explanation: "Deterministic E2E fixture." },
    timeline: [],
    providerRuns: [],
    stats: { assets: 1, webSurfaces: 1, shadowAssets: 0, highPriorityFindings: 0, nonProdSignals: 0 },
  };
}

async function createScan(id: string, finishedAt: Date): Promise<void> {
  await prisma.scan.create({ data: { id, orgId: ORG_A, targetId: TARGET_A, finishedAt, mode: "passive", scoreValue: 61, assetCount: 1 } });
}

describe.sequential("Guardian PostgreSQL integration workflows", () => {
  beforeAll(async () => {
    process.env.GUARDIAN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    await prisma.organization.deleteMany({ where: { id: { in: [ORG_A, ORG_B] } } });
    await prisma.organization.createMany({
      data: [
        { id: ORG_A, name: "Guardian E2E A", slug: ORG_A, plan: "professional" },
        { id: ORG_B, name: "Guardian E2E B", slug: ORG_B, plan: "professional" },
      ],
    });
    await prisma.target.createMany({
      data: [
        { id: TARGET_A, orgId: ORG_A, domain: DOMAIN_A },
        { id: TARGET_B, orgId: ORG_B, domain: DOMAIN_B },
      ],
    });
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: [ORG_A, ORG_B] } } });
    await prisma.$disconnect();
  });

  it("persists deterministic analysis into monthly partitions with tenant isolation", async () => {
    const observedAt = new Date();
    await createScan("e2e_scan_current", observedAt);
    const analysis = analyzeGuardianScan(ORG_A, scanResult("e2e_scan_current", observedAt));
    await store.saveAnalysis(analysis);
    await store.saveAnalysis(analysis);

    const snapshots = await prisma.$queryRaw<Array<{ partition: string }>>`
      SELECT tableoid::regclass::text AS partition FROM "guardian_snapshots" WHERE "scanId" = 'e2e_scan_current'
    `;
    const events = await prisma.$queryRaw<Array<{ partition: string }>>`
      SELECT tableoid::regclass::text AS partition FROM "guardian_events" WHERE "scanId" = 'e2e_scan_current'
    `;
    const activities = await prisma.$queryRaw<Array<{ partition: string }>>`
      SELECT tableoid::regclass::text AS partition FROM "guardian_activity" WHERE "orgId" = ${ORG_A} AND "createdAt" = ${observedAt}
    `;

    expect(snapshots).toHaveLength(1);
    expect(events.length).toBeGreaterThan(0);
    expect(snapshots[0]?.partition).toMatch(/^guardian_snapshots_\d{4}_\d{2}$/);
    expect(events[0]?.partition).toMatch(/^guardian_events_\d{4}_\d{2}$/);
    expect(activities[0]?.partition).toMatch(/^guardian_activity_\d{4}_\d{2}$/);
    expect((await store.overview(ORG_A)).targets).toHaveLength(1);
    expect((await store.overview(ORG_B)).targets).toHaveLength(0);
    expect(await store.events(ORG_B)).toEqual([]);
  });

  it("claims notification work once and supports observable retry completion", async () => {
    const channel = await store.createChannel({
      orgId: ORG_A,
      type: "webhook",
      name: "E2E webhook",
      destinationHint: "hooks.example",
      encryptedConfig: encryptGuardianConfig({ url: "https://hooks.example/guardian" }),
    });
    const input = {
      idempotencyKey: "e2e:guardian:delivery",
      orgId: ORG_A,
      channelId: channel.id,
      channelType: "webhook" as const,
      target: DOMAIN_A,
      kind: "event_group" as const,
      itemCount: 2,
      payload: { title: "E2E delivery" },
    };
    const first = await store.queueDelivery(input);
    const duplicate = await store.queueDelivery(input);
    expect(duplicate.id).toBe(first.id);
    expect((await store.channels(ORG_A, true))[0]).toHaveProperty("encryptedConfig");
    expect(await store.channels(ORG_B, true)).toEqual([]);

    const claimAt = new Date();
    const claims = await Promise.all([
      store.claimDeliveries(claimAt, 10, 30_000),
      store.claimDeliveries(claimAt, 10, 30_000),
    ]);
    const jobs = claims.flat();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.encryptedConfig).toBeTruthy();
    expect((await store.queueMetrics(claimAt)).sending).toBe(1);

    const retryAt = new Date(claimAt.getTime() + 1_000);
    expect(await store.failDelivery(jobs[0]!.id, jobs[0]!.leaseId, "provider timeout", retryAt)).toBe(true);
    expect((await store.queueMetrics(retryAt)).retry).toBe(1);
    const retried = await store.claimDeliveries(retryAt, 1, 30_000);
    expect(retried[0]?.attempts).toBe(2);
    expect(await store.completeDelivery(retried[0]!.id, retried[0]!.leaseId, retryAt)).toBe(true);
    expect(await store.completeDelivery(retried[0]!.id, retried[0]!.leaseId, retryAt)).toBe(false);
  });

  it("applies per-tenant bounded retention without deleting retained scans", async () => {
    const now = new Date();
    const historicalAt = daysAgo(now, 45);
    await createScan("e2e_scan_historical", historicalAt);
    const analysis = analyzeGuardianScan(ORG_A, scanResult("e2e_scan_historical", historicalAt));
    await store.saveAnalysis(analysis);

    const digest = createWeeklyDigest(analysis.snapshot, analysis.events, analysis.recommendations, analysis.drift, daysAgo(now, 100));
    await store.saveDigest(digest);
    await prisma.guardianDelivery.updateMany({ where: { orgId: ORG_A }, data: { createdAt: daysAgo(now, 20) } });
    await createScan("e2e_scan_expired", daysAgo(now, 800));
    await setRetentionPolicy(ORG_A, { scanDays: 730, snapshotDays: 30, eventDays: 30, deliveryDays: 7, activityDays: 30, digestDays: 90 });

    const result = await runGuardianRetention(now, 100, 5);

    expect(result.acquired).toBe(true);
    expect(result.deleted.snapshots).toBeGreaterThanOrEqual(1);
    expect(result.deleted.events).toBeGreaterThanOrEqual(1);
    expect(result.deleted.deliveries).toBeGreaterThanOrEqual(1);
    expect(result.deleted.activity).toBeGreaterThanOrEqual(1);
    expect(result.deleted.digests).toBeGreaterThanOrEqual(1);
    expect(result.deleted.scans).toBeGreaterThanOrEqual(1);
    expect(await prisma.scan.count({ where: { id: "e2e_scan_historical" } })).toBe(1);
    expect(await prisma.scan.count({ where: { id: "e2e_scan_expired" } })).toBe(0);
    expect(await prisma.guardianSnapshot.count({ where: { scanId: "e2e_scan_historical" } })).toBe(0);
  });
});
