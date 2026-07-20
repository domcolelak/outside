import { afterEach, describe, expect, it, vi } from "vitest";
import { checkDomainBreaches, checkIpReputation } from "./providers";
import { enrichThreatIntel, intelEnabled } from "./enrich";
import { generateIntelFindings } from "./findings";
import type { Asset } from "@/lib/types";

function host(id: string, kind: Asset["kind"], addresses: string[]): Asset {
  return {
    id, kind, label: `${id}.acme.com`, canonical: `${id}.acme.com`,
    firstObservedAt: "", lastObservedAt: "", discoveredVia: ["dns"], evidence: [],
    signals: [], priority: "info", orgConfidence: 1, attrs: { addresses },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("threat-intel providers", () => {
  it("returns null when the provider key is not configured", async () => {
    vi.unstubAllEnvs();
    expect(await checkIpReputation("8.8.8.8")).toBeNull();
    expect(await checkDomainBreaches("acme.com")).toBeNull();
    expect(intelEnabled()).toBe(false);
  });

  it("parses an AbuseIPDB reputation response", async () => {
    vi.stubEnv("ABUSEIPDB_API_KEY", "k");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      data: { abuseConfidenceScore: 88, totalReports: 12, lastReportedAt: "2026-05-01T00:00:00Z" },
    }), { status: 200 })));
    const rep = await checkIpReputation("203.0.113.10");
    expect(rep).toMatchObject({ ip: "203.0.113.10", source: "AbuseIPDB", score: 88, reports: 12 });
  });

  it("parses HaveIBeenPwned domain breaches and treats 404 as none", async () => {
    vi.stubEnv("HIBP_API_KEY", "k");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([
      { Name: "Acme2019", Title: "Acme 2019", BreachDate: "2019-03-01" },
    ]), { status: 200 })));
    const exposure = await checkDomainBreaches("acme.com");
    expect(exposure?.breaches).toHaveLength(1);
    expect(exposure?.breaches[0]).toMatchObject({ name: "Acme2019", breachDate: "2019-03-01" });

    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    const none = await checkDomainBreaches("clean.com");
    expect(none?.breaches).toEqual([]);
  });
});

describe("threat-intel enrichment", () => {
  it("attaches worst IP reputation and domain breaches, isolating failures", async () => {
    vi.stubEnv("ABUSEIPDB_API_KEY", "k");
    vi.stubEnv("HIBP_API_KEY", "k");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("abuseipdb")) {
        const ip = new URL(url).searchParams.get("ipAddress");
        const score = ip === "8.8.8.8" ? 90 : 10;
        return new Response(JSON.stringify({ data: { abuseConfidenceScore: score, totalReports: 3 } }), { status: 200 });
      }
      return new Response(JSON.stringify([{ Name: "B", Title: "Breach", BreachDate: "2020-01-01" }]), { status: 200 });
    }));

    // Genuinely public addresses; documentation/private ranges are filtered out.
    const root = host("root", "root_domain", ["8.8.8.8", "1.0.0.1"]);
    const web = host("www", "web_service", ["1.0.0.1"]);
    const runs = await enrichThreatIntel([root, web], "acme.com");

    expect(runs.map((r) => r.provider).sort()).toEqual(["AbuseIPDB", "HaveIBeenPwned"]);
    expect(root.attrs.threatIpScore).toBe(90); // worst across its two addresses
    expect(web.attrs.threatIpScore).toBe(10);
    expect(root.attrs.breachCount).toBe(1);
    expect(root.attrs.breachLatest).toBe("2020-01-01");
  });

  it("skips private addresses", async () => {
    vi.stubEnv("ABUSEIPDB_API_KEY", "k");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { abuseConfidenceScore: 50 } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const internal = host("int", "web_service", ["10.0.0.5", "192.168.1.1"]);
    await enrichThreatIntel([internal], "acme.com");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(internal.attrs.threatIpScore).toBeUndefined();
  });
});

describe("threat-intel findings", () => {
  it("emits an attributed finding above the score floor and nothing below it", () => {
    const flagged = host("www", "web_service", ["203.0.113.10"]);
    flagged.attrs = { ...flagged.attrs, threatIpScore: 80, threatIp: "203.0.113.10", threatIpSource: "AbuseIPDB", threatIpReports: 5 };
    const clean = host("safe", "web_service", ["203.0.113.20"]);
    clean.attrs = { ...clean.attrs, threatIpScore: 10, threatIp: "203.0.113.20", threatIpSource: "AbuseIPDB" };

    const findings = generateIntelFindings([flagged, clean], "now");
    expect(findings).toHaveLength(1);
    expect(findings[0]!.category).toBe("threat-intelligence");
    expect(findings[0]!.priority).toBe("high");
    expect(findings[0]!.observation).toContain("AbuseIPDB");
    expect(findings[0]!.concern).toMatch(/not proof|not a confirmed compromise/i);
  });

  it("emits a breach-exposure finding from root attributes", () => {
    const root = host("root", "root_domain", []);
    root.attrs = { ...root.attrs, breachCount: 2, breachSource: "HaveIBeenPwned", breachNames: ["Acme 2019", "Acme 2021"], breachLatest: "2021-06-01" };
    const findings = generateIntelFindings([root], "now");
    expect(findings).toHaveLength(1);
    expect(findings[0]!.category).toBe("breach-exposure");
    expect(findings[0]!.observation).toContain("2 public data breach(es)");
    expect(findings[0]!.concern).toMatch(/not evidence of a current compromise/i);
  });
});
