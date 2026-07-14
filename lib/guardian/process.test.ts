import { afterEach, describe, expect, it } from "vitest";
import { __resetAuthStore } from "@/lib/auth";
import { InMemoryAuthStore } from "@/lib/auth/memory-store";
import type { Asset, ScanResult } from "@/lib/types";
import { InMemoryGuardianStore } from "./memory-store";
import { processGuardianScan } from "./process";
import { __resetGuardianStore } from "./store";

function result(id: string): ScanResult {
  const asset: Asset = { id: "a", kind: "root_domain", label: "acme.com", canonical: "acme.com", firstObservedAt: "2026-01-01T00:00:00.000Z", lastObservedAt: "2026-01-01T00:00:00.000Z", discoveredVia: ["seed"], evidence: [], signals: [], priority: "low", orgConfidence: 1, attrs: {} };
  return { scanId: id, target: "acme.com", mode: "passive", isDemo: false, startedAt: "2026-01-01T00:00:00.000Z", finishedAt: "2026-01-01T00:01:00.000Z", graph: { assets: [asset], edges: [] }, findings: [], score: { value: 80, band: "guarded", components: [], explanation: "" }, timeline: [], providerRuns: [], stats: { assets: 1, webSurfaces: 0, shadowAssets: 0, highPriorityFindings: 0, nonProdSignals: 0 } };
}

afterEach(() => { __resetAuthStore(); __resetGuardianStore(); });

describe("Guardian paid processing", () => {
  it("gates free organizations and processes paid scans idempotently", async () => {
    const auth = new InMemoryAuthStore();
    const created = await auth.createUserWithOrg({ email: "owner@example.com", name: "Owner", passwordHash: "hash", orgName: "Acme", emailVerified: true });
    const guardian = new InMemoryGuardianStore();
    __resetAuthStore(auth); __resetGuardianStore(guardian);
    expect(await processGuardianScan(created.org.id, result("s1"))).toBeNull();
    await auth.setPlan(created.org.id, "professional");
    expect((await processGuardianScan(created.org.id, result("s1")))?.analysis.snapshot.scanId).toBe("s1");
    expect((await processGuardianScan(created.org.id, result("s1")))?.analysis.snapshot.scanId).toBe("s1");
    expect(await guardian.history(created.org.id, "acme.com")).toHaveLength(1);
  });
});
