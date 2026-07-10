import { describe, expect, it } from "vitest";
import type { Asset, ScanResult, ScoreComponent } from "@/lib/types";
import { buildPosture } from "./recommendations";

function asset(canonical: string, kind: Asset["kind"], signals: Asset["signals"], attrs: Asset["attrs"] = {}): Asset {
  return {
    id: `a_${canonical}`,
    kind,
    label: canonical,
    canonical,
    firstObservedAt: "2026-01-01T00:00:00Z",
    lastObservedAt: "2026-01-01T00:00:00Z",
    discoveredVia: ["dns"],
    evidence: [{ method: "dns", provider: "DoH", summary: "resolves publicly", observedAt: "2026-01-01T00:00:00Z" }],
    signals,
    priority: "high",
    orgConfidence: 1,
    attrs,
  };
}

const shadowSig = { code: "asset.shadow", label: "shadow", assurance: "possible" as const, confidence: 0.8, rationale: "x" };

function fixture(components: ScoreComponent[], assets: Asset[], value: number): ScanResult {
  return {
    scanId: "s1", target: "acme.com", mode: "passive", isDemo: false,
    startedAt: "", finishedAt: "",
    graph: { assets, edges: [] },
    findings: [],
    score: { value, band: "elevated", components, explanation: "" },
    timeline: [], providerRuns: [],
    stats: { assets: assets.length, webSurfaces: 0, shadowAssets: 0, highPriorityFindings: 0, nonProdSignals: 0 },
  };
}

describe("Aegis buildPosture", () => {
  it("derives recommendations and ties reduction to the score component", () => {
    const assets = [
      asset("old.acme.com", "web_service", [shadowSig]),
      asset("mail.acme.com", "mail_service", [], { spf: "missing" }),
    ];
    const components: ScoreComponent[] = [
      { code: "shadow", label: "1 shadow", impact: -6, detail: "" },
      { code: "mail", label: "mail", impact: -7, detail: "" },
    ];
    const posture = buildPosture(fixture(components, assets, 60));

    const shadow = posture.recommendations.find((r) => r.category === "shadow_asset");
    const mail = posture.recommendations.find((r) => r.category === "mail_security");
    expect(shadow?.estimatedReduction).toBe(6);
    expect(mail?.estimatedReduction).toBe(7);
    // Potential = current + sum of open reductions (honest, from the score model).
    expect(posture.potentialScore).toBe(60 + 6 + 7);
    expect(posture.summary).toContain("60 to 73");
  });

  it("sorts by exposure reduction and clamps potential to 100", () => {
    const assets = [asset("old.acme.com", "web_service", [shadowSig])];
    const components: ScoreComponent[] = [{ code: "shadow", label: "shadow", impact: -30, detail: "" }];
    const posture = buildPosture(fixture(components, assets, 90));
    expect(posture.potentialScore).toBe(100); // clamped
    expect(posture.recommendations[0]!.estimatedReduction).toBe(30);
  });

  it("returns a contained summary when nothing is actionable", () => {
    const posture = buildPosture(fixture([], [asset("www.acme.com", "web_service", [])], 95));
    expect(posture.recommendations).toHaveLength(0);
    expect(posture.summary).toContain("well contained");
  });
});
