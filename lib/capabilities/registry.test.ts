import { describe, expect, it } from "vitest";
import { CAPABILITIES, coveredCategories, baselineCapabilities, capability } from "./registry";
import { buildNorthstar } from "@/lib/demo/northstar";
import { generateFindings } from "@/lib/analysis/findings";

/** The canonical set of finding categories the pipeline may emit. A capability
 * claiming any category outside this set is fiction; a category emitted by the
 * code but absent from the registry is undocumented coverage. */
const ALL_FINDING_CATEGORIES = new Set([
  "auth-surface", "breach-exposure", "certificate-expiry", "domain-expiry",
  "exposed-service", "insecure-redirect", "known-vulnerability", "mail-security",
  "non-production-exposure", "security-headers", "shadow-asset", "surface-change",
  "threat-intelligence", "infrastructure-concentration",
]);

const OPTIONAL_PROVIDER_KEYS = new Set([
  "SECURITYTRAILS_API_KEY", "SHODAN_API_KEY", "CENSYS_API_ID",
  "ABUSEIPDB_API_KEY", "HIBP_API_KEY", "GREYNOISE_API_KEY", "VIRUSTOTAL_API_KEY",
]);

describe("capability registry integrity", () => {
  it("has unique capability ids", () => {
    const ids = CAPABILITIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("declares only real finding categories (no fiction)", () => {
    for (const c of CAPABILITIES) {
      for (const cat of c.detects) {
        expect(ALL_FINDING_CATEGORIES, `${c.id} claims unknown category '${cat}'`).toContain(cat);
      }
    }
  });

  it("references only real optional provider keys", () => {
    for (const c of CAPABILITIES) {
      if (c.requiresProviderKey) {
        expect(OPTIONAL_PROVIDER_KEYS, `${c.id}`).toContain(c.requiresProviderKey);
      }
    }
  });
});

describe("capability registry stays in sync with the real pipeline", () => {
  it("covers every finding category a real (enriched demo) scan produces", () => {
    const org = buildNorthstar();
    const findings = generateFindings(org.assets, org.edges, "2026-07-22T00:00:00.000Z");
    const produced = new Set(findings.map((f) => f.category));
    const covered = coveredCategories();

    const uncovered = [...produced].filter((cat) => !covered.has(cat));
    expect(uncovered, `these detected categories are missing from the registry: ${uncovered.join(", ")}`).toEqual([]);
  });

  it("exposes a non-trivial always-on baseline and a keyed layer", () => {
    expect(baselineCapabilities().length).toBeGreaterThanOrEqual(8);
    const keyed = CAPABILITIES.filter((c) => c.requiresProviderKey);
    expect(keyed.length).toBeGreaterThanOrEqual(5);
    // Passive-first: the great majority of capabilities are passive.
    const passive = CAPABILITIES.filter((c) => c.passive).length;
    expect(passive).toBeGreaterThan(CAPABILITIES.length / 2);
  });

  it("resolves capabilities by id", () => {
    expect(capability("CAP-VULN-CORRELATION")?.detects).toContain("known-vulnerability");
    expect(capability("CAP-NOPE")).toBeUndefined();
  });
});
