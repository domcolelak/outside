import { describe, expect, it, vi } from "vitest";
import { AEGIS_CONSTITUTION_VERSION, AEGIS_POLICIES, buildConstitutionPreamble, executiveSummaryPrompt } from "./constitution";
import { findConstitutionViolations } from "./guardrails";
import { OpenAIExplainer } from "./explainer";
import type { ScanResult } from "@/lib/types";

function fixture(): ScanResult {
  return {
    scanId: "s1", target: "acme.com", mode: "passive", isDemo: false,
    startedAt: "2026-01-01T00:00:00Z", finishedAt: "2026-01-01T00:00:00Z",
    graph: { assets: [], edges: [] }, findings: [],
    score: { value: 62, band: "moderate", components: [], explanation: "" },
    timeline: [], providerRuns: [],
    stats: { assets: 5, webSurfaces: 2, shadowAssets: 1, highPriorityFindings: 0, nonProdSignals: 1 },
  };
}

describe("Aegis Constitution", () => {
  it("composes a versioned preamble from every policy block", () => {
    const preamble = buildConstitutionPreamble();
    expect(preamble).toContain(`v${AEGIS_CONSTITUTION_VERSION}`);
    for (const policy of AEGIS_POLICIES) expect(preamble).toContain(policy.title);
    expect(executiveSummaryPrompt()).toContain(preamble);
  });
});

describe("constitution guardrails", () => {
  const evidence = 'Finding:\n{"inference":"Apache/2.4.49 matches CVE-2021-41773 (CVSS 7.5, CISA KEV)."}';

  it("passes evidence-grounded, appropriately-hedged text", () => {
    expect(findConstitutionViolations(
      "On acme.com, staging.acme.com is publicly reachable. This is a prioritized item to confirm, not a confirmed exploit.",
      evidence,
    )).toEqual([]);
  });

  it("allows a CVE and KEV language that appear in the evidence", () => {
    expect(findConstitutionViolations(
      "CVE-2021-41773 is listed in CISA's Known Exploited Vulnerabilities catalogue; confirm the running build.",
      evidence,
    )).toEqual([]);
  });

  it("rejects an unsupported confirmed-vulnerability or exploitation claim", () => {
    expect(findConstitutionViolations("The server is vulnerable and was exploited.", evidence)[0]).toMatch(/confirmed-vulnerability or exploitation/);
    expect(findConstitutionViolations("We successfully exploited the host.", evidence).length).toBeGreaterThan(0);
    expect(findConstitutionViolations("This is a confirmed vulnerability.", evidence).length).toBeGreaterThan(0);
  });

  it("rejects a compliance or certification claim", () => {
    expect(findConstitutionViolations("The organization is SOC 2 compliant.", evidence)[0]).toMatch(/compliance or certification/);
    expect(findConstitutionViolations("Your systems are fully compliant.", evidence).length).toBeGreaterThan(0);
  });

  it("rejects a fabricated CVE not present in the evidence", () => {
    expect(findConstitutionViolations("This matches CVE-2099-0001, a critical flaw.", evidence)[0]).toMatch(/fabricated CVE CVE-2099-0001/);
  });
});

describe("OpenAI explainer enforces the constitution on output", () => {
  it("discards a hallucinated summary and falls back to the deterministic template", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "acme.com is confirmed vulnerable to CVE-2099-0001 and was exploited." } }] }), { status: 200 })) as typeof fetch;
    try {
      const text = await new OpenAIExplainer("sk-test", "gpt-4o-mini").executiveSummary(fixture());
      expect(text).toContain("62/100"); // template marker — the hallucination was rejected
      expect(text).not.toMatch(/exploited/i);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("passes clean model output through unchanged", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "acme.com presents a moderate external surface worth reviewing." } }] }), { status: 200 })) as typeof fetch;
    try {
      const text = await new OpenAIExplainer("sk-test", "gpt-4o-mini").executiveSummary(fixture());
      expect(text).toBe("acme.com presents a moderate external surface worth reviewing.");
    } finally {
      globalThis.fetch = original;
    }
  });
});

vi.restoreAllMocks();
