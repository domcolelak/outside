import { describe, expect, it } from "vitest";
import type { Asset, ScanResult } from "@/lib/types";
import { analyzeGuardianScan } from "./analyze";
import { createEvidenceSnapshot, explainEvidence } from "./evidence";
import { InMemoryGuardianStore } from "./memory-store";

const observedAt = "2026-07-15T10:00:00.000Z";

function asset(address: string, provider = "Cloudflare DoH", id = "asset-acme"): Asset {
  return {
    id, kind: "web_service", label: "app.acme.com", canonical: "app.acme.com", firstObservedAt: observedAt, lastObservedAt: observedAt,
    discoveredVia: ["certificate_transparency", "dns", "http_observation"],
    evidence: [
      { method: "certificate_transparency", provider: "crt.sh", summary: "Hostname observed on a public certificate.", observedAt },
      { method: "dns", provider, summary: `Resolves publicly to ${address}.`, observedAt },
      { method: "http_observation", provider: "Target HTTPS", summary: "Responded over verified HTTPS with status 200.", observedAt },
    ],
    signals: [], priority: "medium", orgConfidence: 0.96,
    attrs: { addresses: [address], status: "200", https: "observed", certFingerprint: "sha256:abc", certNotAfter: "2026-12-01T00:00:00.000Z", technologies: ["nginx"] },
  };
}

function scan(id: string, assets = [asset("203.0.113.10")], finishedAt = observedAt): ScanResult {
  return {
    scanId: id, target: "acme.com", mode: "passive", isDemo: false, startedAt: finishedAt, finishedAt,
    graph: { assets, edges: [] }, findings: [], score: { value: 70, band: "moderate", components: [], explanation: "Fixture" }, timeline: [],
    providerRuns: [
      { provider: "crt.sh", method: "certificate_transparency", status: "ok", startedAt: finishedAt, finishedAt, observations: 1, errors: [] },
      { provider: "Cloudflare DoH", method: "dns", status: "ok", startedAt: finishedAt, finishedAt, observations: 1, errors: [] },
      { provider: "Target HTTPS", method: "http_observation", status: "ok", startedAt: finishedAt, finishedAt, observations: 1, errors: [] },
    ],
    stats: { assets: assets.length, webSurfaces: assets.length, shadowAssets: 0, highPriorityFindings: 0, nonProdSignals: 0 },
  };
}

describe("Guardian Evidence Intelligence", () => {
  it("produces a deterministic, cryptographically sealed snapshot", () => {
    const first = createEvidenceSnapshot("org-1", scan("scan-1"));
    const second = createEvidenceSnapshot("org-1", scan("scan-1"));
    expect(first.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.contentHash).toBe(second.contentHash);
    expect(first.records.map((record) => record.contentHash)).toEqual(second.records.map((record) => record.contentHash));
    expect(first.records.every((record) => record.rawObservation && record.provenance.sourceId)).toBe(true);
  });

  it("explains multi-source support, provider reliability, discovery, and evidence gaps", () => {
    const snapshot = createEvidenceSnapshot("org-1", scan("scan-1"));
    const intelligence = explainEvidence(snapshot, [], { id: "tls-review", title: "Review TLS certificate", affectedAssets: ["app.acme.com"], confidence: 0.94, kind: "recommendation" });
    expect(intelligence.whyWeBelieveThis).toContain("provider/method path");
    expect(intelligence.correlations[0]).toContain("independent");
    expect(intelligence.providers.map((provider) => provider.provider)).toEqual(expect.arrayContaining(["Cloudflare DoH", "Target HTTPS", "crt.sh"]));
    expect(intelligence.entityResolution[0]?.explanation).toContain("stable entity");
    expect(intelligence.supportingEvidence.some((record) => record.normalized.key === "certFingerprint")).toBe(true);
    expect(intelligence.missingEvidence).toEqual([]);
  });

  it("retains contradicting provider observations instead of choosing one", () => {
    const conflicting = asset("203.0.113.99", "Independent DNS", "asset-acme-second");
    const snapshot = createEvidenceSnapshot("org-1", scan("scan-1", [asset("203.0.113.10"), conflicting]));
    const intelligence = explainEvidence(snapshot, [], { id: "dns-review", title: "DNS changed", affectedAssets: ["app.acme.com"], confidence: 1, kind: "event" });
    expect(intelligence.contradictions.some((item) => item.key === "addresses")).toBe(true);
    expect(intelligence.confidence).toBeLessThan(1);
  });

  it("compares normalized DNS, certificate, HTTP, and technology history", () => {
    const first = createEvidenceSnapshot("org-1", scan("scan-1"));
    const changedAsset = asset("203.0.113.20");
    changedAsset.attrs = { ...changedAsset.attrs, certFingerprint: "sha256:def", status: "301", technologies: ["Caddy"] };
    const second = createEvidenceSnapshot("org-1", scan("scan-2", [changedAsset], "2026-07-16T10:00:00.000Z"));
    const intelligence = explainEvidence(second, [first], { id: "surface-change", title: "Infrastructure changed", affectedAssets: ["app.acme.com"], confidence: 1, kind: "event" });
    expect(new Set(intelligence.history.filter((track) => track.points.some((point) => point.changed)).map((track) => track.category))).toEqual(new Set(["dns", "certificate", "http", "technology"]));
    expect(intelligence.timeline.at(-1)?.type).toBe("changed");
  });

  it("rejects a second payload for an already sealed scan", async () => {
    const store = new InMemoryGuardianStore();
    const analysis = analyzeGuardianScan("org-1", scan("scan-1"));
    await store.saveAnalysis(analysis);
    const altered = structuredClone(analysis);
    altered.evidenceSnapshot.contentHash = "f".repeat(64);
    await expect(store.saveAnalysis(altered)).rejects.toThrow("integrity violation");
  });

  it("resolves an original scan finding to its immutable asset evidence", async () => {
    const input = scan("scan-finding");
    input.findings = [{ id: "finding-http", title: "Public HTTP surface", priority: "medium", confidence: 0.91, assetId: "asset-acme", category: "surface", observation: "The host responded publicly.", concern: "Review intended exposure.", reasoning: "Verified response evidence exists.", recommendation: "Confirm ownership and purpose.", evidence: input.graph.assets[0]!.evidence, discoveryMethod: "http_observation", createdAt: observedAt }];
    const store = new InMemoryGuardianStore();
    await store.saveAnalysis(analyzeGuardianScan("org-1", input));
    const intelligence = await store.evidenceIntelligence("org-1", "acme.com", "finding-http");
    expect(intelligence?.finding.kind).toBe("finding");
    expect(intelligence?.supportingEvidence.every((record) => record.subject === "app.acme.com")).toBe(true);
    expect(intelligence?.whyWeBelieveThis).toContain("immutable deterministic");
  });
});
