import { describe, expect, it } from "vitest";
import type { Asset, Finding, ScanResult } from "@/lib/types";
import { buildInvestigation } from "./investigation";

function asset(id: string, canonical: string, attrs: Asset["attrs"] = {}): Asset {
  return {
    id, kind: "web_service", label: canonical, canonical,
    firstObservedAt: "", lastObservedAt: "", discoveredVia: ["dns"],
    evidence: [{ method: "dns", provider: "DoH", summary: "resolves publicly", observedAt: "" }],
    signals: [], priority: "high", orgConfidence: 1, attrs,
  };
}

function finding(id: string, assetId: string, category: string, priority: Finding["priority"] = "high"): Finding {
  return {
    id, title: `${category} on ${assetId}`, priority, confidence: 0.85, assetId, category,
    observation: `${assetId} shows ${category}`, concern: "review", reasoning: "x", recommendation: `fix ${category}`,
    evidence: [], discoveryMethod: "dns", createdAt: "",
  };
}

function fixture(assets: Asset[], findings: Finding[]): ScanResult {
  return {
    scanId: "s1", target: "acme.com", mode: "passive", isDemo: false, startedAt: "", finishedAt: "",
    graph: { assets, edges: [] }, findings,
    score: { value: 50, band: "elevated", components: [], explanation: "" },
    timeline: [], providerRuns: [],
    stats: { assets: assets.length, webSurfaces: 0, shadowAssets: 0, highPriorityFindings: 0, nonProdSignals: 0 },
  };
}

describe("Aegis investigation", () => {
  it("correlates findings on the same asset into one incident", () => {
    const a = asset("a1", "old.acme.com");
    const inv = buildInvestigation(fixture([a], [finding("f1", "a1", "shadow-asset"), finding("f2", "a1", "auth-surface")]));
    expect(inv.incidents).toHaveLength(1);
    expect(inv.incidents[0]!.findingIds.sort()).toEqual(["f1", "f2"]);
    expect(inv.incidents[0]!.blastRadius).toBe(1);
    // Edge breakdown is auditable and includes the same-asset strategy.
    expect(inv.incidents[0]!.edges[0]!.breakdown.same_asset).toBe(1);
  });

  it("does not invent incidents from unrelated singletons", () => {
    const inv = buildInvestigation(
      fixture(
        [asset("a1", "www.acme.com"), asset("a2", "unrelated.other-domain.com")],
        [finding("f1", "a1", "security_headers"), finding("f2", "a2", "third-party", "low")],
      ),
    );
    expect(inv.incidents).toHaveLength(0);
  });

  it("assessment ALWAYS reports contradicting evidence (Devil's Advocate)", () => {
    const a = asset("a1", "staging.acme.com", { cdn: "Cloudflare" });
    const inv = buildInvestigation(
      fixture([a], [finding("f1", "a1", "non-production-exposure"), finding("f2", "a1", "auth-surface")]),
    );
    const assessment = inv.assessment!;
    expect(assessment.contradictingEvidence.length).toBeGreaterThan(0);
    // The CDN mitigation must appear as counter-evidence.
    expect(assessment.contradictingEvidence.some((c) => /CDN|WAF/.test(c))).toBe(true);
    // Confidence is dampened by the counter-evidence.
    expect(assessment.confidence).toBeLessThan(0.85);
    expect(assessment.strongestCounterargument.length).toBeGreaterThan(0);
  });
});
