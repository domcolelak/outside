import { describe, expect, it } from "vitest";
import { computeScanCoverage } from "./engine";
import type { ProviderRun, DiscoveryMethod } from "@/lib/types";

function run(provider: string, method: DiscoveryMethod, status: ProviderRun["status"], error?: string): ProviderRun {
  return { provider, method, status, startedAt: "", finishedAt: "", observations: 0, errors: error ? [error] : [] };
}

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

  it("does not count partial/skipped provider runs as failures", () => {
    const c = computeScanCoverage([run("RDAP", "domain_registration", "partial"), run("DoH", "dns", "ok")]);
    expect(c.complete).toBe(true);
    expect(c.discoveryComplete).toBe(true);
  });
});
