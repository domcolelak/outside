import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { PrismaMonitorStore } from "@/lib/monitoring/prisma-store";
import { withConcurrency } from "@/lib/security/concurrency";

const ORG_ID = "e2e_platform_resilience";
const SCOPE = "e2e:platform-resilience";

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
});
