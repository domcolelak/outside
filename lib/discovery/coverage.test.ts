import { describe, expect, it } from "vitest";
import { computeScanCoverage } from "./engine";
import type { ProviderRun, DiscoveryMethod } from "@/lib/types";

function run(provider: string, method: DiscoveryMethod, status: ProviderRun["status"], error?: string): ProviderRun {
  return { provider, method, status, startedAt: "", finishedAt: "", observations: 0, errors: error ? [error] : [] };
}

describe("registry data that simply does not exist is not a coverage failure", () => {
  it("does not warn about incompleteness for a TLD that publishes no expiry date", () => {
    // Most ccTLDs (.sk among them) omit an expiry in RDAP. Reporting that as a
    // partial run lit a permanent "Enrichment incomplete" banner nobody could
    // action, which trains people to ignore the one signal that has to be
    // trusted. A successful lookup of a registry without the field is complete.
    const c = computeScanCoverage([
      run("crt.sh", "certificate_transparency", "ok"),
      run("RDAP bootstrap", "domain_registration", "ok"),
    ]);
    expect(c.complete).toBe(true);
    expect(c.failed).toEqual([]);
  });

  it("still reports a genuine RDAP failure", () => {
    const c = computeScanCoverage([run("RDAP bootstrap", "domain_registration", "error", "timeout")]);
    expect(c.complete).toBe(false);
    // Registration is enrichment, not discovery: the asset surface is unaffected.
    expect(c.discoveryComplete).toBe(true);
    expect(c.failed[0]?.provider).toBe("RDAP bootstrap");
  });
});

describe("computeScanCoverage", () => {
  it("reports a fully complete scan when every provider succeeded", () => {
    const c = computeScanCoverage([run("crt.sh", "certificate_transparency", "ok"), run("DoH", "dns", "ok")]);
    expect(c).toEqual({ complete: true, discoveryComplete: true, failed: [] });
  });

  it("flags discovery-incomplete when a discovery-stage provider fails", () => {
    const c = computeScanCoverage([
      run("crt.sh", "certificate_transparency", "error", "crt.sh returned 503"),
      run("DoH", "dns", "ok"),
    ]);
    expect(c.complete).toBe(false);
    expect(c.discoveryComplete).toBe(false);
    expect(c.failed).toEqual([{ provider: "crt.sh", method: "certificate_transparency", error: "crt.sh returned 503" }]);
  });

  it("treats enrichment failure as incomplete-but-not-discovery (surface still trustworthy)", () => {
    const c = computeScanCoverage([
      run("DoH", "dns", "ok"),
      run("AbuseIPDB", "threat_intel", "error", "429"),
      run("Censys", "service_observation", "error", "timeout"),
    ]);
    expect(c.complete).toBe(false);
    expect(c.discoveryComplete).toBe(true); // no discovery-stage failure
    expect(c.failed).toHaveLength(2);
  });

  it("marks a partial provider result incomplete but still ignores skipped providers", () => {
    const c = computeScanCoverage([
      run("RDAP", "domain_registration", "partial"),
      run("DoH", "dns", "ok"),
      run("Censys", "service_observation", "skipped"),
    ]);
    expect(c.complete).toBe(false);
    expect(c.discoveryComplete).toBe(true);
    expect(c.failed).toEqual([{ provider: "RDAP", method: "domain_registration", error: "partial result" }]);
  });

  it("marks partial discovery as an incomplete surface", () => {
    const c = computeScanCoverage([run("Cloudflare DoH", "dns", "partial", "one lookup timed out")]);
    expect(c.complete).toBe(false);
    expect(c.discoveryComplete).toBe(false);
  });
});
