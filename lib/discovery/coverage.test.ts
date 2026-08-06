import { describe, expect, it } from "vitest";
import { computeScanCoverage, interleaveCandidates } from "./engine";
import type { ProviderRun, DiscoveryMethod } from "@/lib/types";

function run(provider: string, method: DiscoveryMethod, status: ProviderRun["status"], error?: string): ProviderRun {
  return { provider, method, status, startedAt: "", finishedAt: "", observations: 0, errors: error ? [error] : [] };
}

describe("neither candidate source can crowd the other out", () => {
  const many = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => `${prefix}-${i}.acme.com`);

  it("keeps paid passive-DNS hostnames when certificate transparency floods the cap", () => {
    // Concatenating would spend the whole budget on the free, voluminous source
    // and silently discard every hostname the customer paid a provider for.
    const result = interleaveCandidates(many("passive", 5), many("ct", 100), 10);
    expect(result.filter((host) => host.startsWith("passive"))).toHaveLength(5);
    expect(result).toHaveLength(10);
  });

  it("takes passive first on each round, then certificate transparency", () => {
    expect(interleaveCandidates(["p0.acme.com", "p1.acme.com"], ["c0.acme.com", "c1.acme.com"], 4)).toEqual([
      "p0.acme.com",
      "c0.acme.com",
      "p1.acme.com",
      "c1.acme.com",
    ]);
  });

  it("uses the whole budget when one source is empty", () => {
    expect(interleaveCandidates([], many("ct", 20), 6)).toHaveLength(6);
    expect(interleaveCandidates(many("passive", 20), [], 6)).toHaveLength(6);
  });

  it("never repeats a hostname both sources reported", () => {
    const result = interleaveCandidates(["shared.acme.com", "p1.acme.com"], ["shared.acme.com", "c1.acme.com"], 10);
    expect(result.filter((host) => host === "shared.acme.com")).toHaveLength(1);
    expect(new Set(result).size).toBe(result.length);
  });

  it("returns nothing when there is nothing to select", () => {
    expect(interleaveCandidates([], [], 10)).toEqual([]);
    expect(interleaveCandidates(["a.acme.com"], ["b.acme.com"], 0)).toEqual([]);
  });
});

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
