import { describe, expect, it } from "vitest";
import { classifyDmarc, filterCtHosts, identifyDnsProvider, identifyMailProvider } from "./providers";

describe("filterCtHosts — CT entity resolution", () => {
  const rows = [
    { name_value: "www.example.com", not_before: "2026-01-02" },
    { name_value: "*.example.com\napi.example.com", not_before: "2026-01-01" },
    { name_value: "m.testexample.com", not_before: "2026-01-03" }, // different registrable domain
    { name_value: "evil-example.com" }, // different registrable domain
    { name_value: "EXAMPLE.COM." }, // apex, uppercased, trailing dot
    { name_value: "api.example.com", not_before: "2025-06-01" }, // earlier first-seen for dedupe
  ];

  const hosts = filterCtHosts(rows, "example.com");
  const names = hosts.map((h) => h.host).sort();

  it("keeps only exact matches and proper subdomains", () => {
    expect(names).toEqual(["api.example.com", "example.com", "www.example.com"]);
  });

  it("excludes look-alike registrable domains across the boundary", () => {
    expect(names).not.toContain("m.testexample.com");
    expect(names).not.toContain("evil-example.com");
  });

  it("deduplicates and keeps the earliest first-seen date", () => {
    const api = hosts.find((h) => h.host === "api.example.com");
    expect(api?.firstSeen).toBe("2025-06-01");
  });

  it("normalizes wildcards, casing and trailing dots", () => {
    expect(names).toContain("example.com");
  });
});

describe("Guardian DNS control classification", () => {
  it("classifies DMARC only from an explicit policy", () => {
    expect(classifyDmarc(["\"v=DMARC1; p=reject; rua=mailto:dmarc@example.com\""])).toBe("enforced");
    expect(classifyDmarc(["v=DMARC1; p=none"])).toBe("monitoring");
    expect(classifyDmarc(["v=DMARC1; rua=mailto:dmarc@example.com"])).toBe("invalid");
    expect(classifyDmarc([])).toBe("missing");
  });

  it("identifies providers only from observed authoritative nameserver suffixes", () => {
    expect(identifyDnsProvider(["abby.ns.cloudflare.com", "mark.ns.cloudflare.com"])).toBe("Cloudflare");
    expect(identifyDnsProvider(["ns-100.awsdns-12.com", "ns-200.awsdns-24.net"])).toBe("Amazon Route 53");
    expect(identifyDnsProvider(["ns1.internal.example"])).toBeUndefined();
  });

  it("identifies mail platforms only from observed MX suffixes", () => {
    expect(identifyMailProvider(["aspmx.l.google.com"])).toBe("Google Workspace");
    expect(identifyMailProvider(["acme-com.mail.protection.outlook.com"])).toBe("Microsoft 365");
    expect(identifyMailProvider(["mail.acme.com"])).toBeUndefined();
  });
});
