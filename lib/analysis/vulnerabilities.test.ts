import { describe, expect, it } from "vitest";
import { compareVersions, correlateKnownVulnerabilities, parseTechnologies } from "./vulnerabilities";
import type { Asset } from "@/lib/types";

function asset(technologies: string[]): Asset {
  return {
    id: "a1", kind: "web_service", label: "old-portal.acme.com", canonical: "old-portal.acme.com",
    firstObservedAt: "", lastObservedAt: "", discoveredVia: ["http_observation"], evidence: [],
    signals: [], priority: "info", orgConfidence: 1, attrs: { technologies },
  };
}

describe("known-vulnerability correlation", () => {
  it("compares dotted versions numerically, padding missing segments", () => {
    expect(compareVersions("2.4.49", "2.4.50")).toBe(-1);
    expect(compareVersions("1.20.1", "1.20.1")).toBe(0);
    expect(compareVersions("2.4", "2.4.0")).toBe(0);
    expect(compareVersions("10.0.0", "9.9.9")).toBe(1);
  });

  it("extracts every product/version token from a header string", () => {
    expect(parseTechnologies("Apache/2.4.6 OpenSSL/1.0.1e")).toEqual([
      { product: "apache", version: "2.4.6", raw: "Apache/2.4.6" },
      { product: "openssl", version: "1.0.1e", raw: "OpenSSL/1.0.1e" },
    ]);
    expect(parseTechnologies("nginx")).toEqual([]); // no version disclosed → no correlation
    expect(parseTechnologies("Next.js")).toEqual([]); // not in the product set
  });

  it("matches an exact-version KEV vulnerability at critical priority", () => {
    const findings = correlateKnownVulnerabilities([asset(["Apache/2.4.49"])], "now");
    expect(findings).toHaveLength(1);
    const finding = findings[0]!;
    expect(finding.category).toBe("known-vulnerability");
    expect(finding.title).toContain("path traversal");
    expect(finding.priority).toBe("critical"); // KEV
    expect(finding.inference).toContain("CVE-2021-41773");
    // Honesty guardrail: never claims confirmed exploitation.
    expect(finding.concern).toMatch(/not proof|not a confirmed exploit/i);
  });

  it("flags end-of-life branches from a truncated version", () => {
    const findings = correlateKnownVulnerabilities([asset(["Apache/2.2.15", "PHP/5.6"])], "now");
    const refs = findings.map((f) => f.inference);
    expect(findings.some((f) => f.title.includes("2.2 branch"))).toBe(true);
    expect(findings.some((f) => f.title.includes("PHP 5.x"))).toBe(true);
    expect(refs.every((r) => typeof r === "string")).toBe(true);
  });

  it("does not fire on patched versions or products without a version", () => {
    expect(correlateKnownVulnerabilities([asset(["Apache/2.4.51"])], "now")).toEqual([]);
    expect(correlateKnownVulnerabilities([asset(["nginx/1.20.1"])], "now")).toEqual([]);
    expect(correlateKnownVulnerabilities([asset(["nginx", "Next.js"])], "now")).toEqual([]);
  });

  it("deduplicates the same vulnerability within one asset", () => {
    const findings = correlateKnownVulnerabilities([asset(["Apache/2.4.49", "Apache/2.4.49"])], "now");
    expect(findings).toHaveLength(1);
  });
});
