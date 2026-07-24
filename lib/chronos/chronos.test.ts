import { describe, expect, it } from "vitest";
import { reconstructAt, diffSnapshots, replay, diffBetween } from "./chronos";
import type { GuardianSnapshot, GuardianInventoryItem, GuardianMetrics } from "@/lib/guardian/types";

function item(canonical: string, over: Partial<GuardianInventoryItem> = {}): GuardianInventoryItem {
  return { canonical, label: canonical, kind: "web_service", priority: "info", addresses: ["1.1.1.1"], technologies: [], ...over } as GuardianInventoryItem;
}
function snap(observedAt: string, score: number, inventory: GuardianInventoryItem[]): GuardianSnapshot {
  return {
    orgId: "o", target: "acme.com", scanId: `scan_${observedAt}`, observedAt, exposureScore: score,
    metrics: { assets: inventory.length, shadowAssets: 0 } as GuardianMetrics,
    inventory, checklist: [],
  };
}

// Three recorded points: assets appear, technology changes, an asset disappears.
const T1 = snap("2026-07-01T00:00:00.000Z", 40, [item("www.acme.com", { technologies: ["nginx"] }), item("api.acme.com")]);
const T2 = snap("2026-07-08T00:00:00.000Z", 55, [item("www.acme.com", { technologies: ["nginx", "OpenSSL/1.0.1e"], priority: "high" }), item("api.acme.com"), item("staging.acme.com")]);
const T3 = snap("2026-07-15T00:00:00.000Z", 30, [item("www.acme.com", { technologies: ["nginx", "OpenSSL/1.0.1e"], priority: "high" }), item("staging.acme.com")]);
const ALL = [T3, T1, T2]; // deliberately unordered

describe("Chronos point-in-time reconstruction", () => {
  it("returns the snapshot active at an instant, or null before history begins", () => {
    expect(reconstructAt(ALL, "2026-06-01T00:00:00.000Z")).toBeNull();
    expect(reconstructAt(ALL, "2026-07-05T00:00:00.000Z")?.scanId).toBe(T1.scanId);
    expect(reconstructAt(ALL, "2026-07-08T00:00:00.000Z")?.scanId).toBe(T2.scanId);
    expect(reconstructAt(ALL, "2026-08-01T00:00:00.000Z")?.scanId).toBe(T3.scanId);
  });
});

describe("Chronos diff", () => {
  it("treats a null baseline as an initial observation", () => {
    const d = diffSnapshots(null, T1);
    expect(d.from).toBeNull();
    expect(d.assetChanges.every((c) => c.change === "added")).toBe(true);
    expect(d.summary).toContain("Initial observation");
  });

  it("detects appeared, disappeared and modified assets with details", () => {
    const d = diffSnapshots(T1, T2);
    const byKind = (k: string) => d.assetChanges.filter((c) => c.change === k).map((c) => c.canonical);
    expect(byKind("added")).toContain("staging.acme.com");
    const modified = d.assetChanges.find((c) => c.canonical === "www.acme.com");
    expect(modified?.change).toBe("modified");
    expect(modified?.details.join(" ")).toContain("technology added: OpenSSL/1.0.1e");
    expect(modified?.details.join(" ")).toContain("priority info → high");
    expect(d.exposureScoreDelta).toBe(15);
    expect(d.summary).toContain("protection posture +15");
    expect(d.metricDeltas.assets).toBe(1);
  });

  it("detects a disappeared asset", () => {
    const d = diffSnapshots(T2, T3);
    expect(d.assetChanges.filter((c) => c.change === "removed").map((c) => c.canonical)).toContain("api.acme.com");
    expect(d.exposureScoreDelta).toBe(-25);
    expect(d.summary).toContain("protection posture -25");
  });
});

describe("Chronos replay", () => {
  it("orders the recorded points and diffs each against the previous", () => {
    const steps = replay(ALL);
    expect(steps.map((s) => s.scanId)).toEqual([T1.scanId, T2.scanId, T3.scanId]);
    expect(steps[0]!.diff.from).toBeNull();
    expect(steps[1]!.diff.exposureScoreDelta).toBe(15);
    expect(steps[2]!.diff.exposureScoreDelta).toBe(-25);
  });
});

describe("Chronos diffBetween", () => {
  it("compares the surface at two arbitrary instants regardless of order", () => {
    const d = diffBetween(ALL, "2026-07-15T12:00:00.000Z", "2026-07-02T00:00:00.000Z");
    expect(d).not.toBeNull();
    // Net T1 → T3: staging appeared, api disappeared, www modified.
    const canon = (k: string) => d!.assetChanges.filter((c) => c.change === k).map((c) => c.canonical);
    expect(canon("added")).toContain("staging.acme.com");
    expect(canon("removed")).toContain("api.acme.com");
    expect(d!.exposureScoreDelta).toBe(-10);
  });
});
