import { describe, expect, it } from "vitest";
import { headerProposal, mailProposal, validateChangeProposal } from "./proposal";
import type { ChangeProposal } from "./types";

const base = (over: Partial<ChangeProposal>): ChangeProposal => ({
  format: "dns_records",
  summary: "",
  affects: [],
  autoApply: false,
  validation: { ok: false, issues: [] },
  ...over,
});

describe("validateChangeProposal (ported PatchProposal safety model)", () => {
  it("accepts records within the target's registrable domain", () => {
    const p = validateChangeProposal(
      base({ dnsRecords: [{ name: "acme.com", type: "TXT", value: "v=spf1 -all" }], affects: ["acme.com"] }),
      "acme.com",
    );
    expect(p.validation.ok).toBe(true);
    expect(p.autoApply).toBe(false);
  });

  it("rejects a record outside the registrable domain (root jail)", () => {
    const p = validateChangeProposal(
      base({ dnsRecords: [{ name: "evil.com", type: "TXT", value: "x" }], affects: ["evil.com"] }),
      "acme.com",
    );
    expect(p.validation.ok).toBe(false);
    expect(p.validation.issues.some((i) => /Out of scope/.test(i))).toBe(true);
  });

  it("rejects a record not declared in affects (declared coverage)", () => {
    const p = validateChangeProposal(
      base({ dnsRecords: [{ name: "_dmarc.acme.com", type: "TXT", value: "v=DMARC1; p=none" }], affects: ["acme.com"] }),
      "acme.com",
    );
    expect(p.validation.ok).toBe(false);
    expect(p.validation.issues.some((i) => /not declared/.test(i))).toBe(true);
  });

  it("rejects headers off the safe allowlist", () => {
    const p = validateChangeProposal(
      base({ format: "http_headers", headers: [{ name: "X-Evil", value: "1" }], affects: ["www.acme.com"] }),
      "acme.com",
    );
    expect(p.validation.ok).toBe(false);
  });

  it("generators produce valid, in-scope proposals", () => {
    expect(mailProposal("acme.com").validation.ok).toBe(true);
    expect(headerProposal("acme.com", "www.acme.com", ["Strict-Transport-Security (HSTS)"]).validation.ok).toBe(true);
  });
});
