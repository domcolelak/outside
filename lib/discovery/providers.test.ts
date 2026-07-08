import { describe, expect, it } from "vitest";
import { filterCtHosts } from "./providers";

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
