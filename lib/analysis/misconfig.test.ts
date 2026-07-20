import { describe, expect, it } from "vitest";
import { generateMisconfigurationFindings } from "./misconfig";
import type { Asset } from "@/lib/types";

function asset(kind: Asset["kind"], attrs: Asset["attrs"]): Asset {
  return {
    id: "a1", kind, label: kind === "root_domain" ? "acme.com" : "www.acme.com", canonical: "www.acme.com",
    firstObservedAt: "", lastObservedAt: "", discoveredVia: ["http_observation"], evidence: [],
    signals: [], priority: "info", orgConfidence: 1, attrs,
  };
}

describe("misconfiguration findings", () => {
  it("produces nothing without active-observation attributes", () => {
    expect(generateMisconfigurationFindings([asset("web_service", { addresses: ["1.1.1.1"] })], "now")).toEqual([]);
  });

  it("flags missing security headers with severity by count", () => {
    const one = generateMisconfigurationFindings([asset("web_service", { missingHeaders: ["HSTS"] })], "now");
    expect(one[0]!.category).toBe("security-headers");
    expect(one[0]!.priority).toBe("low");
    const many = generateMisconfigurationFindings([asset("web_service", { missingHeaders: ["HSTS", "CSP", "X-Content-Type-Options"] })], "now");
    expect(many[0]!.priority).toBe("medium");
    expect(many[0]!.observation).toContain("CSP");
  });

  it("flags an HTTPS→HTTP downgrade redirect", () => {
    const f = generateMisconfigurationFindings([asset("web_service", { redirectLocation: "http://acme.com/login" })], "now");
    expect(f[0]!.category).toBe("insecure-redirect");
    // A safe https redirect must not fire.
    expect(generateMisconfigurationFindings([asset("web_service", { redirectLocation: "https://acme.com/" })], "now")).toEqual([]);
  });

  it("grades certificate expiry and flags an expired certificate", () => {
    expect(generateMisconfigurationFindings([asset("web_service", { certDaysToExpiry: 40 })], "now")).toEqual([]);
    expect(generateMisconfigurationFindings([asset("web_service", { certDaysToExpiry: 20 })], "now")[0]!.priority).toBe("low");
    expect(generateMisconfigurationFindings([asset("web_service", { certDaysToExpiry: 5 })], "now")[0]!.priority).toBe("high");
    const expired = generateMisconfigurationFindings([asset("web_service", { certDaysToExpiry: -3 })], "now");
    expect(expired[0]!.title).toContain("expired");
    expect(expired[0]!.priority).toBe("high");
  });

  it("flags an expiring domain registration only on the root domain", () => {
    expect(generateMisconfigurationFindings([asset("web_service", { domainDaysToExpiry: 5 })], "now")).toEqual([]);
    const f = generateMisconfigurationFindings([asset("root_domain", { domainDaysToExpiry: 10 })], "now");
    expect(f[0]!.category).toBe("domain-expiry");
    expect(f[0]!.priority).toBe("high");
    expect(f[0]!.concern).toMatch(/not a current compromise/i);
  });
});
