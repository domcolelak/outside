import { describe, expect, it } from "vitest";
import { buildShareRecord } from "./shares";
import type { ScanResult } from "@/lib/types";

function fixture(): ScanResult {
  return {
    scanId: "s1", target: "acme.com", mode: "passive", isDemo: false,
    startedAt: "2026-01-01T00:00:00Z", finishedAt: "2026-01-01T00:00:00Z",
    graph: { assets: [], edges: [] },
    findings: Array.from({ length: 20 }, (_, i) => ({
      id: `f${i}`, title: `Finding ${i}`, priority: "medium" as const, confidence: 0.8,
      assetId: "a1", category: "x", observation: "obs", concern: "concern", reasoning: "r",
      recommendation: "fix", evidence: [], discoveryMethod: "dns" as const, createdAt: "",
    })),
    score: { value: 62, band: "moderate", components: [], explanation: "" },
    timeline: [], providerRuns: [],
    stats: { assets: 5, webSurfaces: 2, shadowAssets: 1, highPriorityFindings: 0, nonProdSignals: 1 },
  };
}

describe("shareable scan snapshots", () => {
  it("builds a bounded, public-safe snapshot with an unlisted token and expiry", () => {
    const now = new Date("2026-03-01T00:00:00Z");
    const record = buildShareRecord(fixture(), now, 30);
    expect(record.token).toMatch(/^[A-Za-z0-9_-]{16}$/); // 12 bytes base64url
    expect(record.target).toBe("acme.com");
    expect(record.score).toBe(62);
    expect(record.band).toBe("moderate");
    expect(record.expiresAt.toISOString()).toBe("2026-03-31T00:00:00.000Z");
    expect(record.snapshot.findings).toHaveLength(12); // capped
    expect(record.snapshot.stats.assets).toBe(5);
    // Only public projection fields are carried.
    expect(Object.keys(record.snapshot.findings[0]!).sort()).toEqual(["concern", "confidence", "observation", "priority", "title"]);
  });

  it("gives each share a distinct token", () => {
    const a = buildShareRecord(fixture());
    const b = buildShareRecord(fixture());
    expect(a.token).not.toBe(b.token);
  });
});
