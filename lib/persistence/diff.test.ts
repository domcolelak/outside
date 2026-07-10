import { describe, expect, it } from "vitest";
import type { Asset, AssetKind, ScanResult } from "@/lib/types";
import { InMemoryScanStore } from "./memory-store";
import { recordScan } from "./record";
import { diffScans, toSnapshot } from "./diff";

function mkAsset(canonical: string, opts: { kind?: AssetKind; tech?: string[]; priority?: Asset["priority"]; cert?: string } = {}): Asset {
  return {
    id: `a_${canonical}`,
    kind: opts.kind ?? "web_service",
    label: canonical,
    canonical,
    firstObservedAt: "2026-01-01T00:00:00.000Z",
    lastObservedAt: "2026-01-01T00:00:00.000Z",
    discoveredVia: ["dns"],
    evidence: [],
    signals: [],
    priority: opts.priority ?? "low",
    orgConfidence: 1,
    attrs: { technologies: opts.tech ?? [], ...(opts.cert ? { certFingerprint: opts.cert } : {}) },
  };
}

function mkScan(id: string, assets: Asset[]): ScanResult {
  return {
    scanId: id,
    target: "acme.com",
    mode: "passive",
    isDemo: false,
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: `2026-01-0${id.slice(-1)}T00:00:00.000Z`,
    graph: { assets, edges: [] },
    findings: [],
    score: { value: 80, band: "guarded", components: [], explanation: "" },
    timeline: [],
    providerRuns: [],
    stats: { assets: assets.length, webSurfaces: assets.length, shadowAssets: 0, highPriorityFindings: 0, nonProdSignals: 0 },
  };
}

describe("diffScans (pure)", () => {
  it("reports brand-new vs returning assets correctly", () => {
    const prev = [toSnapshot(mkAsset("www.acme.com"), "s1", "i1")];
    const curr = [toSnapshot(mkAsset("www.acme.com"), "s2", "i1"), toSnapshot(mkAsset("test.acme.com"), "s2", "i2")];
    const events = diffScans(prev, curr, new Set(["www.acme.com"]));
    expect(events.find((e) => e.canonical === "test.acme.com")?.type).toBe("asset_appeared");

    // Same test host but it was seen before -> returned.
    const events2 = diffScans(prev, curr, new Set(["www.acme.com", "test.acme.com"]));
    expect(events2.find((e) => e.canonical === "test.acme.com")?.type).toBe("asset_returned");
  });

  it("detects disappearance and technology change", () => {
    const prev = [toSnapshot(mkAsset("api.acme.com", { tech: ["nginx"] }), "s1", "i1"), toSnapshot(mkAsset("old.acme.com"), "s1", "i2")];
    const curr = [toSnapshot(mkAsset("api.acme.com", { tech: ["nginx", "Cloudflare"] }), "s2", "i1")];
    const events = diffScans(prev, curr, new Set(["api.acme.com", "old.acme.com"]));
    expect(events.find((e) => e.canonical === "old.acme.com")?.type).toBe("asset_disappeared");
    const tech = events.find((e) => e.canonical === "api.acme.com" && e.type === "technology_changed");
    expect(tech?.to).toContain("Cloudflare");
  });

  it("detects a certificate change on a stable host", () => {
    const prev = [toSnapshot(mkAsset("www.acme.com", { cert: "fp_aaa" }), "s1", "i1")];
    const curr = [toSnapshot(mkAsset("www.acme.com", { cert: "fp_bbb" }), "s2", "i1")];
    const events = diffScans(prev, curr, new Set(["www.acme.com"]));
    const cert = events.find((e) => e.type === "certificate_changed");
    expect(cert?.from).toBe("fp_aaa");
    expect(cert?.to).toBe("fp_bbb");
    // No cert key on one side -> no false positive.
    const prev2 = [toSnapshot(mkAsset("www.acme.com"), "s1", "i1")];
    expect(diffScans(prev2, curr, new Set(["www.acme.com"])).some((e) => e.type === "certificate_changed")).toBe(false);
  });
});

describe("temporal identity across a gap (InMemoryScanStore)", () => {
  it("preserves one identity when an asset disappears and returns", async () => {
    const store = new InMemoryScanStore();
    // Scan 1: www + staging
    await recordScan(store, mkScan("s1", [mkAsset("www.acme.com"), mkAsset("staging.acme.com")]));
    // Scan 2: staging gone
    const s2 = mkScan("s2", [mkAsset("www.acme.com")]);
    await recordScan(store, s2);
    expect(s2.changeSummary?.events.some((e) => e.canonical === "staging.acme.com" && e.type === "asset_disappeared")).toBe(true);
    // Scan 3: staging returns
    const s3 = mkScan("s3", [mkAsset("www.acme.com"), mkAsset("staging.acme.com")]);
    await recordScan(store, s3);
    expect(s3.changeSummary?.events.some((e) => e.canonical === "staging.acme.com" && e.type === "asset_returned")).toBe(true);

    // The identity id for staging must be identical in scan 1 and scan 3.
    const identities = store.identitiesFor((await store.getOrCreateTarget("acme.com")).id);
    const staging = identities.filter((i) => i.canonical === "staging.acme.com");
    expect(staging).toHaveLength(1);
    expect(staging[0]!.firstSeenAt < staging[0]!.lastSeenAt).toBe(true);
  });

  it("flags returning/new assets as newlyObserved from real history, not naming", async () => {
    const store = new InMemoryScanStore();
    await recordScan(store, mkScan("s1", [mkAsset("www.acme.com")]));
    const s2 = mkScan("s2", [mkAsset("www.acme.com"), mkAsset("shop.acme.com")]);
    await recordScan(store, s2);
    const shop = s2.graph.assets.find((a) => a.canonical === "shop.acme.com");
    expect(shop?.attrs.newlyObserved).toBe(true);
    const www = s2.graph.assets.find((a) => a.canonical === "www.acme.com");
    expect(www?.attrs.newlyObserved).toBeUndefined();
  });
});
