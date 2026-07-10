import { describe, expect, it } from "vitest";
import { AnthropicExplainer, TemplateExplainer, getExplainer } from "./explainer";
import type { ScanResult } from "@/lib/types";

function fixture(): ScanResult {
  return {
    scanId: "s1",
    target: "acme.com",
    mode: "passive",
    isDemo: false,
    startedAt: "2026-01-01T00:00:00Z",
    finishedAt: "2026-01-01T00:00:00Z",
    graph: { assets: [], edges: [] },
    findings: [],
    score: { value: 62, band: "moderate", components: [], explanation: "" },
    timeline: [],
    providerRuns: [],
    stats: { assets: 5, webSurfaces: 2, shadowAssets: 1, highPriorityFindings: 0, nonProdSignals: 1 },
  };
}

describe("AI explanation layer", () => {
  it("template explainer is deterministic and mentions real numbers", async () => {
    const e = new TemplateExplainer();
    const a = await e.executiveSummary(fixture());
    const b = await e.executiveSummary(fixture());
    expect(a).toBe(b);
    expect(a).toContain("acme.com");
    expect(a).toContain("62/100");
  });

  it("does not mutate the scan result (read-only guardrail)", async () => {
    const result = fixture();
    const snapshot = JSON.stringify(result);
    await new TemplateExplainer().executiveSummary(result);
    expect(JSON.stringify(result)).toBe(snapshot);
  });

  it("Anthropic explainer degrades to the template when the API call fails", async () => {
    // Stub fetch so the test never touches the network.
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response("nope", { status: 500 })) as typeof fetch;
    try {
      const e = new AnthropicExplainer("sk-invalid", "claude-sonnet-5");
      const text = await e.executiveSummary(fixture());
      expect(text).toContain("acme.com"); // fell back to template
    } finally {
      globalThis.fetch = original;
    }
  });

  it("Anthropic explainer uses model text on success", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ content: [{ type: "text", text: "Custom AI summary for acme.com." }] }), { status: 200 })) as typeof fetch;
    try {
      const e = new AnthropicExplainer("sk-test", "claude-sonnet-5");
      const text = await e.executiveSummary(fixture());
      expect(text).toBe("Custom AI summary for acme.com.");
    } finally {
      globalThis.fetch = original;
    }
  });

  it("template explains a single finding from its fields only", async () => {
    const finding = {
      id: "f1", title: "Possible staging environment", priority: "high" as const, confidence: 0.94,
      assetId: "a1", category: "non-production-exposure",
      observation: "staging.acme.com is publicly reachable.", inference: "Naming indicates staging.",
      concern: "Non-production environments may carry weaker controls.", reasoning: "x",
      recommendation: "Restrict access or remove it.", evidence: [], discoveryMethod: "dns" as const, createdAt: "",
    };
    const text = await new TemplateExplainer().explainFinding(finding, "acme.com");
    expect(text).toContain("acme.com");
    expect(text).toContain("Restrict access");
  });

  it("factory returns template when no API key is configured", () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    expect(getExplainer().kind).toBe("template");
    if (prev) process.env.ANTHROPIC_API_KEY = prev;
  });
});
