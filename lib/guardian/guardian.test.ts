import { describe, expect, it } from "vitest";
import type { Asset, AssetKind, ScanResult, Signal } from "@/lib/types";
import { analyzeGuardianScan } from "./analyze";
import { createWeeklyDigest } from "./digest";
import { InMemoryGuardianStore } from "./memory-store";

function asset(canonical: string, kind: AssetKind = "web_service", attrs: Asset["attrs"] = {}, signals: Signal[] = []): Asset {
  return {
    id: `asset-${canonical}`, kind, label: canonical, canonical,
    firstObservedAt: "2026-06-01T00:00:00.000Z", lastObservedAt: "2026-06-01T00:00:00.000Z",
    discoveredVia: ["dns", "http_observation"],
    evidence: [{ method: "dns", provider: "Cloudflare DNS over HTTPS", summary: `${canonical} resolves publicly`, observedAt: "2026-06-01T00:00:00.000Z" }],
    signals, priority: signals.length ? "high" : "low", orgConfidence: 1, attrs,
  };
}

function scan(id: string, day: number, assets: Asset[], changes?: ScanResult["changeSummary"]): ScanResult {
  return {
    scanId: id, target: "acme.com", mode: "passive", isDemo: false,
    startedAt: `2026-06-${String(day).padStart(2, "0")}T00:00:00.000Z`, finishedAt: `2026-06-${String(day).padStart(2, "0")}T00:01:00.000Z`,
    graph: { assets, edges: [] }, findings: [], score: { value: 72, band: "moderate", components: [], explanation: "" }, timeline: [], providerRuns: [],
    stats: { assets: assets.length, webSurfaces: assets.length, shadowAssets: 0, highPriorityFindings: 0, nonProdSignals: 0 }, changeSummary: changes,
  };
}

function baselineAssets() {
  return [
    asset("acme.com", "root_domain", { addresses: ["203.0.113.10"], protocols: ["HTTPS"], dnssec: "present", dnsProvider: "Cloudflare", presentHeaders: ["Strict-Transport-Security (HSTS)"], securityTxt: "present", certFingerprint: "fp-a", certNotAfter: "2026-12-01T00:00:00.000Z", certDaysToExpiry: 180 }),
    asset("mail:acme.com", "mail_service", { mx: ["mx1.example.net"], spf: "present", dkim: "present", dmarc: "enforced", mtaSts: "enforced" }),
  ];
}

describe("Guardian deterministic analysis", () => {
  it("does not fabricate change events for a stable observation", () => {
    const first = analyzeGuardianScan("org-1", scan("s1", 1, baselineAssets()));
    const second = analyzeGuardianScan("org-1", scan("s2", 2, baselineAssets()), [first.snapshot]);
    expect(second.events).toEqual([]);
    expect(second.drift.direction).toBe("stable");
    expect(second.snapshot.checklist.find((item) => item.code === "dkim")?.state).toBe("pass");
  });

  it("correlates new authentication and non-production surfaces from existing signals", () => {
    const first = analyzeGuardianScan("org-1", scan("s1", 1, baselineAssets()));
    const login = asset("login-stage.acme.com", "auth_surface", { addresses: ["203.0.113.20"], protocols: ["HTTPS"] }, [
      { code: "surface.auth", label: "Login surface", assurance: "inferred", confidence: 0.91, rationale: "Public response contains an authentication marker." },
      { code: "env.nonprod", label: "Staging", assurance: "inferred", confidence: 0.82, rationale: "Hostname contains an environment marker." },
    ]);
    const secondScan = scan("s2", 2, [...baselineAssets(), login], { previousScanId: "s1", events: [{ type: "asset_appeared", canonical: login.canonical, label: login.label, detail: "A new public asset appeared on the external surface.", priority: "high" }], counts: { appeared: 1, returned: 0, disappeared: 0, changed: 0 } });
    const result = analyzeGuardianScan("org-1", secondScan, [first.snapshot]);
    expect(result.events.some((event) => event.type === "auth_surface_new")).toBe(true);
    expect(result.events.some((event) => event.type === "nonproduction_reachable")).toBe(false);
    const recommendation = result.recommendations.find((item) => item.code.startsWith("auth:"));
    expect(recommendation?.evidence[0]?.scanId).toBe("s2");
    expect(recommendation?.reasoning).toContain("login-stage.acme.com");
  });

  it("reconstructs presence changes when scan persistence completed before Guardian", () => {
    const first = analyzeGuardianScan("org-1", scan("s1", 1, baselineAssets()));
    const newAsset = asset("new.acme.com", "web_service", { addresses: ["203.0.113.50"] });
    const recovered = analyzeGuardianScan("org-1", scan("s2", 2, [...baselineAssets(), newAsset]), [first.snapshot]);
    expect(recovered.events.find((event) => event.affectedAssets.includes("new.acme.com"))?.type).toBe("asset_new");
  });

  it("detects DNS, mail, redirect, provider, and threshold changes from exact values", () => {
    const first = analyzeGuardianScan("org-1", scan("s1", 1, baselineAssets()));
    const changed = baselineAssets();
    changed[0]!.attrs = { ...changed[0]!.attrs, addresses: ["203.0.113.99"], cnames: ["app.elasticbeanstalk.com"], redirectLocation: "https://new.acme.com/", dnsProvider: "Amazon Route 53", cloudProvider: "Amazon Web Services", providerEvidence: ["Public DNS CNAME points to app.elasticbeanstalk.com."], certDaysToExpiry: 30, certNotAfter: "2026-07-01T00:00:00.000Z" };
    changed[1]!.attrs = { ...changed[1]!.attrs, dmarc: "monitoring" };
    const result = analyzeGuardianScan("org-1", scan("s2", 2, changed), [first.snapshot]);
    expect(new Set(result.events.map((event) => event.type))).toEqual(expect.objectContaining(new Set(["dns_changed", "mail_security_changed", "redirect_changed", "infrastructure_changed", "certificate_expiring", "checklist_changed"])));
    const dns = result.events.find((event) => event.type === "dns_changed")!;
    expect(dns.evidence.map((entry) => entry.observation).join(" ")).toContain("203.0.113.99");
    expect(dns.evidence.map((entry) => entry.observation).join(" ")).toContain("app.elasticbeanstalk.com");
    expect(dns.confidence).toBe(1);
    expect(result.events.find((event) => event.type === "infrastructure_changed")?.evidence.map((entry) => entry.observation).join(" ")).toContain("app.elasticbeanstalk.com");
  });

  it("raises expiry milestones on the first factual baseline", () => {
    const root = asset("acme.com", "root_domain", { domainExpiresAt: "2026-06-20T00:00:00.000Z", domainDaysToExpiry: 12, certNotAfter: "2026-06-18T00:00:00.000Z", certDaysToExpiry: 10 });
    const result = analyzeGuardianScan("org-1", scan("s1", 1, [root]));
    expect(result.events.some((event) => event.type === "certificate_expiring" && event.severity === "critical")).toBe(true);
    expect(result.events.some((event) => event.type === "domain_expiring" && event.severity === "critical")).toBe(true);
  });

  it("uses verified HTTPS evidence and keeps transport failures unknown", () => {
    const root = asset("acme.com", "root_domain", { https: "unverified", presentHeaders: [], certDaysToExpiry: 40, tlsValidation: "unverified" });
    const www = asset("www.acme.com", "web_service", { https: "observed", presentHeaders: ["Strict-Transport-Security (HSTS)"], certDaysToExpiry: 90, tlsValidation: "valid", securityTxt: "present" });
    www.discoveredVia.push("http_observation");
    const verified = analyzeGuardianScan("org-1", scan("s1", 1, [root, www]));
    expect(verified.snapshot.checklist.find((item) => item.code === "https")?.state).toBe("pass");
    expect(verified.snapshot.checklist.find((item) => item.code === "hsts")?.evidence[0]?.asset).toBe("www.acme.com");

    const unknown = analyzeGuardianScan("org-1", scan("s2", 2, [root]));
    expect(unknown.snapshot.checklist.find((item) => item.code === "https")?.state).toBe("unknown");
    expect(unknown.snapshot.checklist.find((item) => item.code === "hsts")?.state).toBe("unknown");
  });

  it("calculates exposure drift and a factual weekly digest", () => {
    const first = analyzeGuardianScan("org-1", scan("s1", 1, baselineAssets()));
    const additions = Array.from({ length: 6 }, (_, index) => asset(`public-${index}.acme.com`, "web_service", { addresses: [`203.0.113.${30 + index}`] }));
    const changeEvents = additions.map((row) => ({ type: "asset_appeared" as const, canonical: row.canonical, label: row.label, detail: "A new public asset appeared on the external surface.", priority: "medium" as const }));
    const second = analyzeGuardianScan("org-1", scan("s2", 8, [...baselineAssets(), ...additions], { previousScanId: "s1", events: changeEvents, counts: { appeared: 6, returned: 0, disappeared: 0, changed: 0 } }), [first.snapshot]);
    expect(second.drift.dimensions.find((item) => item.code === "assets")?.delta).toBe(6);
    expect(second.events.some((event) => event.type === "surface_growth")).toBe(true);
    const digest = createWeeklyDigest(second.snapshot, second.events, second.recommendations, second.drift, new Date("2026-06-08T12:00:00.000Z"));
    expect(digest.newAssets).toBe(6);
    expect(digest.reviewItems.length).toBeGreaterThan(0);
    expect(digest.executiveSummary).toContain("6 new or returning");
  });

  it("preserves recommendation state and idempotency in the store", async () => {
    const store = new InMemoryGuardianStore();
    const observedRoot = () => asset("acme.com", "root_domain", { protocols: ["HTTPS"], https: "observed", presentHeaders: [], tlsValidation: "valid", certDaysToExpiry: 90 });
    const analysis = analyzeGuardianScan("org-1", scan("s1", 1, [observedRoot()]));
    await store.saveAnalysis(analysis);
    await store.saveAnalysis(analysis);
    const open = (await store.recommendations("org-1"))[0]!;
    expect(await store.updateRecommendation("org-1", open.id, "acknowledged", "Owner")).toBe(true);
    const later = analyzeGuardianScan("org-1", scan("s2", 2, [observedRoot()]), [analysis.snapshot], await store.recommendations("org-1"));
    await store.saveAnalysis(later);
    expect((await store.history("org-1", "acme.com"))).toHaveLength(2);
    expect((await store.recommendations("org-1")).find((row) => row.id === open.id)?.status).toBe("acknowledged");
    await store.updateRecommendation("org-1", open.id, "resolved", "Owner");
    const third = analyzeGuardianScan("org-1", scan("s3", 3, [observedRoot()]), [analysis.snapshot, later.snapshot], await store.recommendations("org-1"));
    await store.saveAnalysis(third);
    expect((await store.recommendations("org-1")).find((row) => row.id === open.id)?.status).toBe("open");
  });
});
