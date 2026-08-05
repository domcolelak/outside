import { describe, expect, it } from "vitest";
import { assess, ASSESS_CHECKS } from "./checks";
import type { Finding, ProviderRun, DiscoveryMethod } from "@/lib/types";

function finding(category: string, priority: Finding["priority"] = "medium", id = `f-${category}`): Finding {
  return { id, category, priority, title: category, confidence: 0.9, assetId: "a1", observation: "", concern: "", reasoning: "", recommendation: "", evidence: [], discoveryMethod: "dns", createdAt: "2026-07-25" } as Finding;
}

function run(method: DiscoveryMethod, status: ProviderRun["status"] = "ok"): ProviderRun {
  return { provider: method, method, status, startedAt: "", finishedAt: "", observations: 1, errors: [] };
}

/** A fully observed scan — every method the catalogue requires ran cleanly, so an
 * absent finding really does mean the check passed. Derived from the catalogue so
 * a new check with a new requirement can't silently leave these cases uncovered. */
function fullCoverage(): { providerRuns: ProviderRun[] } {
  const methods = Array.from(new Set(ASSESS_CHECKS.flatMap((check) => check.requires)));
  return { providerRuns: methods.map((method) => run(method)) };
}

describe("Assess catalogue", () => {
  it("contains only safe verified checks — no exploit capability", () => {
    for (const check of ASSESS_CHECKS) {
      expect(check.mode).toBe("verified-safe");
      expect(check.id).not.toMatch(/exploit|brute|inject|payload|dos|overflow/i);
      expect(check.title).not.toMatch(/exploit|brute[- ]?force|payload/i);
    }
    // Every check maps to a real, versioned entry.
    expect(new Set(ASSESS_CHECKS.map((c) => c.id)).size).toBe(ASSESS_CHECKS.length);
  });
});

describe("assess()", () => {
  it("passes a check with no matching finding and fails one that has findings", () => {
    const result = assess([finding("security-headers", "high")], fullCoverage());
    const headers = result.results.find((r) => r.check.category === "security-headers")!;
    const mail = result.results.find((r) => r.check.category === "mail-security")!;
    expect(headers.status).toBe("fail");
    expect(headers.severity).toBe("high");
    expect(headers.findingIds).toEqual(["f-security-headers"]);
    expect(mail.status).toBe("pass");
    expect(mail.severity).toBeNull();
  });

  it("passes every check on a clean surface", () => {
    const result = assess([], fullCoverage());
    expect(result.summary.failed).toBe(0);
    expect(result.summary.passed).toBe(ASSESS_CHECKS.length);
    expect(result.results.every((r) => r.status === "pass")).toBe(true);
  });

  it("never reports a pass when a required provider was absent or incomplete", () => {
    const result = assess([], {
      providerRuns: [
        run("certificate_transparency"),
        run("dns"),
        run("dns_mx"),
        run("http_observation", "partial"),
        run("domain_registration", "error"),
      ],
    });
    expect(result.results.find((item) => item.check.id === "http-security-headers")).toMatchObject({
      status: "not_evaluated",
      reason: expect.stringContaining("http_observation"),
    });
    expect(result.results.find((item) => item.check.id === "domain-registration")?.status).toBe("not_evaluated");
    expect(result.results.find((item) => item.check.id === "exposed-services")?.status).toBe("not_evaluated");
    expect(result.summary.notEvaluated).toBeGreaterThan(0);
    expect(result.summary.passed + result.summary.failed + result.summary.notEvaluated).toBe(result.summary.total);
  });

  it("can still fail a check when evidence exists despite partial coverage", () => {
    const result = assess([finding("security-headers", "high")], { providerRuns: [run("http_observation", "partial")] });
    expect(result.results.find((item) => item.check.id === "http-security-headers")?.status).toBe("fail");
  });

  it("takes the worst severity when a check has several findings", () => {
    const result = assess([finding("known-vulnerability", "low", "a"), finding("known-vulnerability", "critical", "b"), finding("known-vulnerability", "medium", "c")], fullCoverage());
    const vuln = result.results.find((r) => r.check.category === "known-vulnerability")!;
    expect(vuln.severity).toBe("critical");
    expect(vuln.findingIds).toEqual(["a", "b", "c"]);
  });

  it("summarises pass/fail counts and failures by severity", () => {
    const result = assess([finding("security-headers", "medium"), finding("mail-security", "high"), finding("certificate-expiry", "high")], fullCoverage());
    expect(result.summary.failed).toBe(3);
    expect(result.summary.passed).toBe(ASSESS_CHECKS.length - 3);
    expect(result.summary.failedBySeverity).toEqual({ medium: 1, high: 2 });
  });

  it("is deterministic and records the catalogue version", () => {
    const a = assess([finding("shadow-asset")], fullCoverage());
    const b = assess([finding("shadow-asset")], fullCoverage());
    expect(a).toEqual(b);
    expect(a.catalogueVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
