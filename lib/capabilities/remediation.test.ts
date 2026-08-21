import { describe, expect, it } from "vitest";
import { REMEDIATION_CAPABILITIES, remediationCapability, remediationsFor, oneClickCapability, remediationCoverage } from "./remediation";
import { coveredCategories } from "./registry";
import { verifiableCapabilityIds } from "@/lib/integrations/verification";
import { buildNorthstar } from "@/lib/demo/northstar";
import { generateFindings } from "@/lib/analysis/findings";

/**
 * These are the invariants that make the product's central claim structural
 * rather than incidental. A capability may always understate what OUTSIDE does;
 * it may never overstate it, and the build is where that is enforced.
 */
describe("remediation coverage registry integrity", () => {
  it("has unique capability ids", () => {
    const ids = REMEDIATION_CAPABILITIES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("addresses only categories OUTSIDE can actually detect", () => {
    const detectable = coveredCategories();
    for (const entry of REMEDIATION_CAPABILITIES) {
      for (const category of entry.findingCategories) {
        expect(detectable, `${entry.id} claims to remediate '${category}', which nothing detects`).toContain(category);
      }
    }
  });

  it("never claims it can apply a change it cannot verify and reverse", () => {
    for (const entry of REMEDIATION_CAPABILITIES.filter((c) => c.applySupported)) {
      expect(entry.verifySupported, `${entry.id} applies without verifying`).toBe(true);
      expect(entry.rollbackSupported, `${entry.id} applies without a rollback`).toBe(true);
    }
  });

  it("backs every verify claim with a registered verifier", () => {
    const registered = new Set(verifiableCapabilityIds());
    for (const entry of REMEDIATION_CAPABILITIES.filter((c) => c.verifySupported)) {
      expect(registered, `${entry.id} claims external verification with no verifier behind it`).toContain(entry.id);
    }
  });

  it("has no verifier for a capability that does not claim verification", () => {
    for (const id of verifiableCapabilityIds()) {
      const entry = remediationCapability(id);
      expect(entry, `a verifier is registered for unknown capability ${id}`).toBeDefined();
      expect(entry!.verifySupported, `${id} has a verifier but does not declare verification`).toBe(true);
    }
  });

  it("only offers one-click where a provider actually writes the change", () => {
    for (const entry of REMEDIATION_CAPABILITIES.filter((c) => c.support === "one_click")) {
      expect(entry.provider, `${entry.id} is one-click with no provider`).not.toBeNull();
      expect(entry.applySupported).toBe(true);
      expect(entry.previewSupported, `${entry.id} would apply without showing what it changes`).toBe(true);
      expect(entry.requiredScopes.length, `${entry.id} does not state the privilege it needs`).toBeGreaterThan(0);
      expect(entry.source, `${entry.id} names no implementing module`).not.toBeNull();
    }
  });

  it("keeps autopilot behind apply, verify and rollback", () => {
    for (const entry of REMEDIATION_CAPABILITIES.filter((c) => c.autopilotEligible)) {
      expect(entry.applySupported && entry.verifySupported && entry.rollbackSupported, `${entry.id} is autopilot-eligible without the full loop`).toBe(true);
    }
  });

  it("keeps detect-only entries honest — no capability flags set", () => {
    for (const entry of REMEDIATION_CAPABILITIES.filter((c) => c.support === "detect_only")) {
      expect(
        [entry.guideSupported, entry.previewSupported, entry.applySupported, entry.verifySupported, entry.rollbackSupported],
        `${entry.id} is detect-only but claims capability`,
      ).toEqual([false, false, false, false, false]);
    }
  });
});

describe("registry stays in sync with the real pipeline", () => {
  it("states coverage for every category a real scan produces", () => {
    const org = buildNorthstar();
    const produced = new Set(generateFindings(org.assets, org.edges, "2026-07-22T00:00:00.000Z").map((f) => f.category));
    const addressed = new Set(REMEDIATION_CAPABILITIES.flatMap((entry) => entry.findingCategories));

    const silent = [...produced].filter((category) => !addressed.has(category));
    expect(silent, `these categories are detected but say nothing about remediation: ${silent.join(", ")}`).toEqual([]);
  });
});

describe("what the UI is allowed to offer", () => {
  it("offers the one-click fix only when its provider is connected", () => {
    expect(oneClickCapability("mail-security", ["cloudflare"])?.id).toBe("REM-CF-DMARC-MONITORING");
    expect(oneClickCapability("mail-security", [])).toBeNull();
    expect(oneClickCapability("mail-security", ["aws"])).toBeNull();
  });

  it("never offers a one-click fix for a guided or detect-only category", () => {
    expect(oneClickCapability("security-headers", ["cloudflare"])).toBeNull();
    expect(oneClickCapability("known-vulnerability", ["cloudflare"])).toBeNull();
  });

  it("ranks the strongest support first for a category", () => {
    expect(remediationsFor("mail-security")[0]?.support).toBe("one_click");
    expect(remediationsFor("nonexistent-category")).toEqual([]);
  });

  it("reports closure coverage rather than finding volume", () => {
    const coverage = remediationCoverage();
    expect(coverage.total).toBe(REMEDIATION_CAPABILITIES.length);
    expect(coverage.verifiable).toBe(coverage.reversible);
    expect(coverage.oneClick).toBeLessThanOrEqual(coverage.guided);
  });
});
