import { afterEach, describe, expect, it, vi } from "vitest";
import { __resetEpssIndex, applyEpss, currentEpssIndex, knownCveIds, parseEpssResponse, syncEpss } from "./epss";
import { correlateKnownVulnerabilities } from "./vulnerabilities";
import type { Asset } from "@/lib/types";

function asset(technologies: string[]): Asset {
  return {
    id: "a1", kind: "web_service", label: "host.acme.com", canonical: "host.acme.com",
    firstObservedAt: "", lastObservedAt: "", discoveredVia: ["http_observation"], evidence: [],
    signals: [], priority: "info", orgConfidence: 1, attrs: { technologies },
  };
}

afterEach(() => {
  __resetEpssIndex();
  vi.restoreAllMocks();
});

describe("EPSS feed", () => {
  it("parses the FIRST.org response and clamps probabilities", () => {
    const records = parseEpssResponse({ status: "OK", data: [
      { cve: "cve-2021-23017", epss: "0.42311", percentile: "0.97010", date: "2026-07-20" },
      { cve: "CVE-2014-0160", epss: "1.5", percentile: "-0.2" },
      { cve: "not-a-cve", epss: "0.1" },
    ] });
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ cveId: "CVE-2021-23017", score: 0.42311, percentile: 0.9701 });
    expect(records[1]).toMatchObject({ cveId: "CVE-2014-0160", score: 1, percentile: 0 });
  });

  it("only scores CVEs the matcher can fire on", () => {
    const ids = knownCveIds();
    expect(ids).toContain("CVE-2021-23017");
    expect(ids.every((id) => /^CVE-\d{4}-\d{4,}$/.test(id))).toBe(true);
  });

  it("syncs scores into the in-process index via the API", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [
      { cve: "CVE-2021-23017", epss: "0.8", percentile: "0.99" },
    ] }), { status: 200 })));
    const result = await syncEpss({ now: new Date("2026-04-01T00:00:00Z") });
    expect(result.count).toBe(1);
    expect(currentEpssIndex().get("cve-2021-23017")?.score).toBe(0.8);
  });

  it("raises priority and annotates a finding when EPSS is high", () => {
    // nginx CVE-2021-23017 is curated kev:false, cvss 7.7 → high on its own; use a lower-cvss demo instead.
    const before = correlateKnownVulnerabilities([asset(["OpenSSH/7.6"])], "now"); // CVE-2018-15473, cvss 5.3 → medium
    expect(before[0]!.priority).toBe("medium");
    expect(before[0]!.concern).not.toMatch(/EPSS/);

    applyEpss([{ cveId: "CVE-2018-15473", score: 0.72, percentile: 0.98 }], new Date("2026-04-01T00:00:00Z"));
    const after = correlateKnownVulnerabilities([asset(["OpenSSH/7.6"])], "now");
    expect(after[0]!.priority).toBe("high"); // EPSS >= 0.5 lifts it
    expect(after[0]!.inference).toContain("EPSS 72%");
    expect(after[0]!.concern).toContain("30-day exploitation probability at 72.0%");
  });

  it("does not change behavior when EPSS is not synced", () => {
    const findings = correlateKnownVulnerabilities([asset(["OpenSSH/7.6"])], "now");
    expect(findings[0]!.priority).toBe("medium");
  });
});
