import { afterEach, describe, expect, it, vi } from "vitest";
import { __resetKevIndex, applyKevCatalog, currentKevIndex, parseKevCatalog, syncKev, type KevRecord } from "./kev";
import { correlateKnownVulnerabilities } from "./vulnerabilities";
import type { Asset } from "@/lib/types";

function feed(vulnerabilities: unknown[]) {
  return { title: "CISA KEV", catalogVersion: "2026.01", vulnerabilities };
}

function asset(technologies: string[]): Asset {
  return {
    id: "a1", kind: "web_service", label: "old-portal.acme.com", canonical: "old-portal.acme.com",
    firstObservedAt: "", lastObservedAt: "", discoveredVia: ["http_observation"], evidence: [],
    signals: [], priority: "info", orgConfidence: 1, attrs: { technologies },
  };
}

afterEach(() => {
  __resetKevIndex();
  vi.restoreAllMocks();
});

describe("CISA KEV feed", () => {
  it("parses the catalogue shape and normalizes fields", () => {
    const records = parseKevCatalog(feed([
      { cveID: "cve-2021-23017", vendorProject: "F5", product: "nginx", vulnerabilityName: "nginx resolver off-by-one", dateAdded: "2024-02-01", dueDate: "2024-02-15", knownRansomwareCampaignUse: "Known", shortDescription: "Off-by-one in the DNS resolver." },
      { cveID: "CVE-2014-0160", vendorProject: "OpenSSL", product: "OpenSSL", vulnerabilityName: "Heartbleed", dateAdded: "2022-05-04", knownRansomwareCampaignUse: "Unknown", shortDescription: "Memory disclosure." },
      { cveID: "not-a-cve", product: "junk" },
      "garbage",
    ]));
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ cveId: "CVE-2021-23017", knownRansomware: true, dueDate: "2024-02-15" });
    expect(records[1]).toMatchObject({ cveId: "CVE-2014-0160", knownRansomware: false });
    expect(records[1]!.dueDate).toBeUndefined();
  });

  it("returns an empty list for malformed input", () => {
    expect(parseKevCatalog(null)).toEqual([]);
    expect(parseKevCatalog({})).toEqual([]);
    expect(parseKevCatalog({ vulnerabilities: "x" })).toEqual([]);
  });

  it("syncs the catalogue into the in-process index", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(feed([
      { cveID: "CVE-2021-23017", vendorProject: "F5", product: "nginx", vulnerabilityName: "n", dateAdded: "2024-02-01", knownRansomwareCampaignUse: "Known", shortDescription: "s" },
    ])), { status: 200 })));

    const result = await syncKev({ now: new Date("2026-03-01T00:00:00Z") });
    expect(result.count).toBe(1);
    const index = currentKevIndex();
    expect(index.size).toBe(1);
    expect(index.get("cve-2021-23017")?.knownRansomware).toBe(true);
    expect(index.syncedAt).toBe("2026-03-01T00:00:00.000Z");
  });

  it("propagates a feed failure and leaves the cache untouched", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    await expect(syncKev()).rejects.toThrow(/500/);
    expect(currentKevIndex().size).toBe(0);
  });

  it("upgrades a curated finding to critical when the CVE is live-listed in KEV", () => {
    // nginx CVE-2021-23017 is curated with kev:false → high on its own.
    const before = correlateKnownVulnerabilities([asset(["nginx/1.18.0"])], "now");
    expect(before).toHaveLength(1);
    expect(before[0]!.priority).toBe("high");
    expect(before[0]!.concern).not.toMatch(/CISA added/);

    const live: KevRecord = { cveId: "CVE-2021-23017", vendor: "F5", product: "nginx", name: "n", dateAdded: "2024-02-01", dueDate: "2024-02-15", knownRansomware: true, shortDescription: "s" };
    applyKevCatalog([live], "https://example.test/kev.json", new Date("2026-03-01T00:00:00Z"));

    const after = correlateKnownVulnerabilities([asset(["nginx/1.18.0"])], "now");
    expect(after).toHaveLength(1);
    expect(after[0]!.priority).toBe("critical");
    expect(after[0]!.inference).toContain("CISA KEV");
    expect(after[0]!.concern).toContain("CISA added CVE-2021-23017 to the Known Exploited Vulnerabilities catalogue on 2024-02-01");
    expect(after[0]!.concern).toContain("known ransomware campaigns");
    expect(after[0]!.reasoning).toContain("synced 2026-03-01T00:00:00.000Z");
  });

  it("still fires KEV findings from the static flag when the catalogue is empty", () => {
    // Apache 2.4.49 is curated with kev:true and must stay critical offline.
    const findings = correlateKnownVulnerabilities([asset(["Apache/2.4.49"])], "now");
    expect(findings[0]!.priority).toBe("critical");
    expect(findings[0]!.concern).toContain("listed in CISA's Known Exploited Vulnerabilities catalogue");
  });
});
