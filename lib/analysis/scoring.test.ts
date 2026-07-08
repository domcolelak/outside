import { describe, expect, it } from "vitest";
import { buildNorthstar } from "@/lib/demo/northstar";
import { detectAssetSignals, assetPriority, type SignalContext } from "./signals";
import { computeExposureScore } from "./scoring";
import { generateFindings } from "./findings";
import type { Asset } from "@/lib/types";

/** Run the shared classification pass a scan would apply. */
function classify(): Asset[] {
  const org = buildNorthstar();
  const degree = new Map<string, number>();
  for (const e of org.edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }
  const ctx: SignalContext = {
    linkedFromPrimary: new Set(org.linkedFromPrimary),
    degreeById: degree,
    now: new Date().toISOString(),
  };
  for (const a of org.assets) {
    a.signals = detectAssetSignals(a, org.edges, ctx);
    a.priority = assetPriority(a.signals);
  }
  return org.assets;
}

describe("signal classification (Northstar demo)", () => {
  const assets = classify();
  const byHost = (h: string) => assets.find((a) => a.canonical === h)!;

  it("flags the staging host as a non-production environment", () => {
    const staging = byHost("staging.northstarlabs.example");
    expect(staging.signals.some((s) => s.code === "env.nonprod")).toBe(true);
  });

  it("classifies the legacy portal as a possible shadow asset via correlation", () => {
    const legacy = byHost("old-portal.northstarlabs.example");
    const shadow = legacy.signals.find((s) => s.code === "asset.shadow");
    expect(shadow).toBeTruthy();
    expect(shadow!.assurance).toBe("possible");
    expect(shadow!.rationale.length).toBeGreaterThan(20);
  });

  it("does NOT flag the primary www host as shadow", () => {
    const www = byHost("www.northstarlabs.example");
    expect(www.signals.some((s) => s.code === "asset.shadow")).toBe(false);
  });

  it("detects the vpn host as an authentication surface", () => {
    const vpn = byHost("vpn.northstarlabs.example");
    expect(vpn.signals.some((s) => s.code === "surface.auth")).toBe(true);
  });
});

describe("exposure score", () => {
  const assets = classify();
  const findings = generateFindings(assets, [], new Date().toISOString());
  const score = computeExposureScore(assets, findings);

  it("is deterministic and bounded to [0,100]", () => {
    expect(score.value).toBeGreaterThanOrEqual(0);
    expect(score.value).toBeLessThanOrEqual(100);
    expect(computeExposureScore(classify(), findings).value).toBe(score.value);
  });

  it("every component sums to the reported value (fully explainable)", () => {
    const total = score.components.reduce((s, c) => s + c.impact, 0);
    expect(Math.max(0, Math.min(100, 100 + total))).toBe(score.value);
  });

  it("penalizes shadow assets and mail-security gaps", () => {
    expect(score.components.some((c) => c.code === "shadow")).toBe(true);
    expect(score.components.some((c) => c.code === "mail")).toBe(true);
  });
});

describe("findings", () => {
  it("generates a shadow-asset finding with separated observation/inference/concern", () => {
    const assets = classify();
    const findings = generateFindings(assets, [], new Date().toISOString());
    const shadow = findings.find((f) => f.category === "shadow-asset");
    expect(shadow).toBeTruthy();
    expect(shadow!.observation).not.toEqual(shadow!.concern);
    expect(shadow!.recommendation.length).toBeGreaterThan(0);
    expect(shadow!.evidence.length).toBeGreaterThan(0);
  });

  it("sorts findings by priority (critical/high first)", () => {
    const assets = classify();
    const findings = generateFindings(assets, [], new Date().toISOString());
    const rank = { critical: 4, high: 3, medium: 2, low: 1, info: 0 } as const;
    for (let i = 1; i < findings.length; i++) {
      expect(rank[findings[i - 1]!.priority]).toBeGreaterThanOrEqual(rank[findings[i]!.priority]);
    }
  });
});
