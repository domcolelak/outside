import { describe, expect, it } from "vitest";
import { prepareDraft } from "./draft";
import type { KevRecord } from "@/lib/analysis/kev";

function kev(over: Partial<KevRecord> = {}): KevRecord {
  return { cveId: "CVE-2024-4577", vendor: "PHP Group", product: "PHP", name: "PHP CGI argument injection", dateAdded: "2024-06-12", knownRansomware: true, shortDescription: "A CGI argument-injection flaw allows remote code execution.", ...over };
}

describe("Evolution draft change preparation", () => {
  it("builds a KNOWN_VULNERABILITIES stub with the evidence-backed fields filled", () => {
    const d = prepareDraft({ proposalId: "EVP-CVE-2024-4577", cveId: "CVE-2024-4577", product: "php", kev: kev() });
    expect(d.proposalId).toBe("EVP-CVE-2024-4577");
    expect(d.file).toBe("lib/analysis/vulnerabilities.ts");
    expect(d.entry).toContain('product: "php"');
    expect(d.entry).toContain('ref: "CVE-2024-4577"');
    expect(d.entry).toContain("kev: true");
  });

  it("never guesses what it cannot know — range and cvss are left as human TODOs", () => {
    const d = prepareDraft({ proposalId: "EVP-CVE-2024-4577", cveId: "CVE-2024-4577", product: "php", kev: kev() });
    expect(d.entry).toContain("range: {}"); // empty, not fabricated
    expect(d.entry).toMatch(/range:.*TODO\(human\)/);
    expect(d.entry).toMatch(/cvss: 0.*TODO\(human\)/);
    expect(d.requiresHumanInput.some((r) => r.startsWith("range"))).toBe(true);
  });

  it("restates the safety contract and never implies auto-application", () => {
    const d = prepareDraft({ proposalId: "EVP-X", cveId: "CVE-2024-4577", product: "php" });
    expect(d.note.toLowerCase()).toContain("draft only");
    expect(d.note.toLowerCase()).toMatch(/never writes|never commits|deploys/);
  });

  it("escapes quotes in KEV-derived text so the stub stays valid TypeScript", () => {
    const d = prepareDraft({ proposalId: "EVP-X", cveId: "CVE-2024-4577", product: "php", kev: kev({ shortDescription: 'A flaw in the "cgi" handler enables RCE.' }) });
    expect(d.entry).toContain('\\"cgi\\"');
    // Every summary/title/recommendation line is a well-formed double-quoted string.
    for (const line of d.entry.split("\n")) {
      const m = /^\s*(summary|title|recommendation): "(.*)",$/.exec(line);
      if (m) expect(m[2]).not.toMatch(/(?<!\\)"/); // no unescaped inner quote
    }
  });

  it("falls back to a generic summary when no KEV record is available", () => {
    const d = prepareDraft({ proposalId: "EVP-X", cveId: "CVE-2024-4577", product: "citrix" });
    expect(d.entry).toContain("citrix");
    expect(d.entry).toContain("CISA KEV");
  });
});
