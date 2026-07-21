import { describe, expect, it } from "vitest";
import { buildNorthstar } from "./northstar";
import { generateFindings } from "@/lib/analysis/findings";
import { correlateKnownVulnerabilities } from "@/lib/analysis/vulnerabilities";

describe("Northstar demo showcases every feature", () => {
  const org = buildNorthstar();
  const findings = generateFindings(org.assets, org.edges, "2026-07-21T00:00:00.000Z");
  const categories = new Set(findings.map((f) => f.category));

  it("produces at least one finding from every finding generator", () => {
    for (const category of [
      "security-headers",      // misconfig: missing HTTP security headers
      "insecure-redirect",     // misconfig: HTTPS->HTTP downgrade
      "certificate-expiry",    // misconfig: expiring TLS cert
      "domain-expiry",         // misconfig: expiring domain registration
      "known-vulnerability",   // CVE/KEV/EPSS correlation
      "threat-intelligence",   // AbuseIPDB / GreyNoise
      "breach-exposure",       // HaveIBeenPwned
      "exposed-service",       // Censys non-web services
    ]) {
      expect(categories, `missing demo finding category: ${category}`).toContain(category);
    }
  });

  it("correlates a live-enrichable CVE (Heartbleed) so KEV/EPSS have something to enrich", () => {
    const vulns = correlateKnownVulnerabilities(org.assets, "2026-07-21T00:00:00.000Z");
    expect(vulns.some((f) => f.title.includes("Heartbleed"))).toBe(true);
  });

  it("includes a host discovered only via passive-DNS", () => {
    const passive = org.assets.find((a) => a.discoveredVia.includes("passive_subdomain"));
    expect(passive?.label).toBe("internal-tools.northstarlabs.example");
    expect(passive?.evidence.some((e) => e.provider === "SecurityTrails")).toBe(true);
  });

  it("flags an internet-exposed datastore from Censys observation", () => {
    const exposed = findings.find((f) => f.category === "exposed-service");
    expect(exposed?.observation).toContain("3306");
    expect(exposed?.priority).toBe("high");
  });
});
