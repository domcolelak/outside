import { beforeEach, describe, expect, it } from "vitest";
import {
  recordIncident,
  listIncidents,
  __resetIncidents,
  isDetectorCategory,
  detectorReliability,
  reliabilityFactors,
  applyDetectorReliability,
  RELIABILITY_FLOOR,
  type IncidentSignal,
} from "./incidents";
import type { Finding } from "@/lib/types";

beforeEach(() => __resetIncidents());

function incident(category: string, verdict: IncidentSignal["verdict"]): IncidentSignal {
  return { id: `${category}-${verdict}-${Math.random()}`, category, verdict, actor: "founder@outside.test" };
}
function finding(category: string, confidence: number): Finding {
  return { category, confidence, id: `f-${category}`, title: category, priority: "medium", assetId: "a1", observation: "", concern: "", reasoning: "", recommendation: "", evidence: [], discoveryMethod: "dns", createdAt: "2026-07-23" } as unknown as Finding;
}

describe("Evolution incident store (memory fallback)", () => {
  it("records and lists incident verdicts", async () => {
    await recordIncident({ category: "shadow-asset", verdict: "false_positive", actor: "founder@outside.test" });
    await recordIncident({ category: "shadow-asset", verdict: "confirmed", actor: "founder@outside.test" });
    const all = await listIncidents();
    expect(all).toHaveLength(2);
    expect(all.map((i) => i.verdict).sort()).toEqual(["confirmed", "false_positive"]);
  });

  it("validates detector categories", () => {
    expect(isDetectorCategory("known-vulnerability")).toBe(true);
    expect(isDetectorCategory("made-up-category")).toBe(false);
    expect(isDetectorCategory("")).toBe(false);
  });
});

describe("Evolution detector reliability", () => {
  it("maps confirmed share into [FLOOR, 1]", () => {
    const r = detectorReliability([
      incident("shadow-asset", "confirmed"),
      incident("shadow-asset", "confirmed"),
      incident("shadow-asset", "confirmed"),
      incident("shadow-asset", "false_positive"), // 3/4 confirmed
      incident("surface-change", "false_positive"),
      incident("surface-change", "false_positive"), // all false → floored
    ]);
    expect(r.get("shadow-asset")!.factor).toBeCloseTo(RELIABILITY_FLOOR + (1 - RELIABILITY_FLOOR) * 0.75);
    expect(r.get("surface-change")!.factor).toBe(RELIABILITY_FLOOR); // never below the floor
    expect(r.get("shadow-asset")).toMatchObject({ confirmed: 3, falsePositive: 1 });
  });

  it("has no entry (→ full trust) for detectors without feedback", () => {
    expect(detectorReliability([]).size).toBe(0);
    expect(reliabilityFactors([]).size).toBe(0);
  });
});

describe("applyDetectorReliability", () => {
  it("down-weights a noisy detector's confidence, never inflates, leaves others untouched", () => {
    const factors = new Map([["shadow-asset", 0.5]]);
    const findings = [finding("shadow-asset", 0.9), finding("known-vulnerability", 0.8)];
    const out = applyDetectorReliability(findings, factors);
    expect(out[0]!.confidence).toBeCloseTo(0.45); // 0.9 * 0.5
    expect(out[1]!.confidence).toBe(0.8); // untouched detector
    expect(findings[0]!.confidence).toBe(0.9); // input not mutated
  });

  it("is a no-op when nothing has been learned", () => {
    const findings = [finding("shadow-asset", 0.9)];
    expect(applyDetectorReliability(findings, new Map())).toBe(findings);
  });

  it("never raises confidence even if a factor is >= 1", () => {
    const out = applyDetectorReliability([finding("mail-security", 0.6)], new Map([["mail-security", 1.5]]));
    expect(out[0]!.confidence).toBe(0.6);
  });
});
