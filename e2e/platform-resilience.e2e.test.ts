import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { PrismaMonitorStore } from "@/lib/monitoring/prisma-store";
import { PrismaScanStore } from "@/lib/persistence/prisma-store";
import { recordScan } from "@/lib/persistence/record";
import { withConcurrency } from "@/lib/security/concurrency";
import type { Asset, ScanResult } from "@/lib/types";

const ORG_ID = "e2e_platform_resilience";
const SCOPE = "e2e:platform-resilience";
const temporalAsset = (): Asset => ({ id: "asset_temporal", kind: "web_service", label: "www.temporal.example", canonical: "www.temporal.example", firstObservedAt: "2026-01-01T00:00:00.000Z", lastObservedAt: "2026-01-01T00:00:00.000Z", discoveredVia: ["dns"], evidence: [], signals: [], priority: "low", orgConfidence: 1, attrs: { technologies: [] } });
const temporalScan = (id: string, finishedAt: string): ScanResult => ({ scanId: id, target: "temporal.example", mode: "passive", isDemo: false, startedAt: finishedAt, finishedAt, graph: { assets: [temporalAsset()], edges: [] }, findings: [], score: { value: 90, band: "guarded", components: [], explanation: "" }, timeline: [], providerRuns: [], stats: { assets: 1, webSurfaces: 1, shadowAssets: 0, highPriorityFindings: 0, nonProdSignals: 0 } });

describe.sequential("platform resilience PostgreSQL workflows", () => {
  beforeAll(async () => {
    await prisma.concurrencyLease.deleteMany({ where: { scope: SCOPE } });
    await prisma.organization.deleteMany({ where: { id: ORG_ID } });
    await prisma.organization.create({
      data: {
        id: ORG_ID,
        name: "Platform resilience E2E",
        slug: ORG_ID,
        plan: "professional",
      },
    });
  });

  afterAll(async () => {
    await prisma.concurrencyLease.deleteMany({ where: { scope: SCOPE } });
    await prisma.organization.deleteMany({ where: { id: ORG_ID } });
    await prisma.$disconnect();
  });

  it("acquires and releases a distributed concurrency lease", async () => {
    const result = await withConcurrency(SCOPE, 1, 30_000, async () => "complete");

    expect(result).toBe("complete");
    await expect(
      prisma.concurrencyLease.count({ where: { scope: SCOPE } }),
    ).resolves.toBe(0);
  });

  it("serializes monitor-limit checks with a PostgreSQL advisory lock", async () => {
    const store = new PrismaMonitorStore();
    const monitor = await store.create({
      orgId: ORG_ID,
      domain: "resilience.example",
      frequency: "daily",
      limit: 1,
    });

    expect(monitor?.orgId).toBe(ORG_ID);
    await expect(
      store.create({
        orgId: ORG_ID,
        domain: "second.example",
        frequency: "daily",
        limit: 1,
      }),
    ).resolves.toBeNull();
  });

  it("serializes temporal scans per target and preserves monotonic identity bounds", async () => {
    const store = new PrismaScanStore();
    const scans = [
      temporalScan("temporal-s3", "2026-01-03T00:00:00.000Z"),
      temporalScan("temporal-s1", "2026-01-01T00:00:00.000Z"),
      temporalScan("temporal-s2", "2026-01-02T00:00:00.000Z"),
    ];
    const summaries = await Promise.all(scans.map((scan) => recordScan(store, scan, ORG_ID, true)));
    expect(summaries.filter((summary) => summary?.previousScanId === null)).toHaveLength(1);
    const target = await prisma.target.findUniqueOrThrow({ where: { orgId_domain: { orgId: ORG_ID, domain: "temporal.example" } } });
    const identity = await prisma.assetIdentity.findUniqueOrThrow({ where: { targetId_canonical: { targetId: target.id, canonical: "www.temporal.example" } } });
    expect(identity.firstSeenAt.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(identity.lastSeenAt.toISOString()).toBe("2026-01-03T00:00:00.000Z");
  });
});
