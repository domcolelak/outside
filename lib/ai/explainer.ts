/**
 * AI explanation layer — provider-abstracted and strictly read-only.
 *
 * Hard guardrail: an explainer receives the already-finalized ScanResult and
 * returns natural-language text ONLY. It can never create assets, findings,
 * evidence, or scores — the deterministic pipeline owns all of those. The
 * default TemplateExplainer needs no API key, so the product always works;
 * AnthropicExplainer is used when ANTHROPIC_API_KEY is present and degrades to
 * the template on any error.
 */

import type { Finding, ScanResult } from "@/lib/types";
import { buildExecutiveSummary } from "@/lib/report/summary";

export interface Explainer {
  readonly kind: "template" | "anthropic";
  /** A plain-English executive summary of the external surface. */
  executiveSummary(result: ScanResult): Promise<string>;
  /** A plain-English explanation of a single finding. */
  explainFinding(finding: Finding, target: string): Promise<string>;
}

/** Deterministic, zero-dependency explainer. Always available. */
export class TemplateExplainer implements Explainer {
  readonly kind = "template" as const;
  async executiveSummary(result: ScanResult): Promise<string> {
    return buildExecutiveSummary(result);
  }
  async explainFinding(f: Finding, target: string): Promise<string> {
    const period = (s: string) => s.trim().replace(/\.?$/, ".");
    const inference = f.inference ? ` ${period(f.inference)}` : "";
    return `On ${target}, ${period(f.observation)}${inference} ${period(f.concern)} This is a ${f.priority}-priority item at ${Math.round(f.confidence * 100)}% confidence. Recommended review: ${period(f.recommendation)}`;
  }
}

/**
 * Compact, evidence-bounded projection of a scan for the model. We deliberately
 * pass only derived facts (never raw internals) and instruct the model to
 * rephrase — not to add findings.
 */
function projectForModel(result: ScanResult) {
  return {
    target: result.target,
    isDemo: result.isDemo,
    score: result.score.value,
    band: result.score.band,
    stats: result.stats,
    findings: result.findings.slice(0, 12).map((f: Finding) => ({
      title: f.title,
      priority: f.priority,
      confidence: Math.round(f.confidence * 100),
      asset: f.assetId,
      observation: f.observation,
      concern: f.concern,
    })),
    changes: result.changeSummary?.events.slice(0, 8).map((e) => ({ type: e.type, label: e.label })) ?? [],
  };
}

const SYSTEM_PROMPT =
  "You are an analyst writing a concise executive summary of an organization's EXTERNAL, publicly observable digital surface. " +
  "You will receive a JSON projection of a completed, deterministic scan. Rules: " +
  "(1) Use ONLY the facts provided — never invent assets, findings, vulnerabilities, or numbers. " +
  "(2) Distinguish observed facts from inferences; do not claim compromise, breach, or exploitation. " +
  "(3) Be factual and measured — no sensationalism, no security buzzwords. " +
  "(4) 3–5 sentences, plain prose, no headings or lists. If evidence is weak, say so.";

const FINDING_PROMPT =
  "You explain a SINGLE external-surface finding to a non-expert stakeholder. Use ONLY the provided " +
  "fields — never invent details. Keep the observed fact separate from the inference and the possible " +
  "concern. Do not claim compromise or exploitation. 2–3 sentences of plain prose, then the recommended action.";

export class AnthropicExplainer implements Explainer {
  readonly kind = "anthropic" as const;
  constructor(
    private apiKey: string,
    private model = process.env.OUTSIDE_AI_MODEL ?? "claude-sonnet-5",
    private fallback: Explainer = new TemplateExplainer(),
  ) {}

  private async call(system: string, userContent: string, maxTokens = 400): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: userContent }],
      }),
    }).finally(() => clearTimeout(timer));

    if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = data.content?.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    if (!text) throw new Error("Empty AI response");
    return text;
  }

  async executiveSummary(result: ScanResult): Promise<string> {
    try {
      return await this.call(SYSTEM_PROMPT, `Scan projection:\n${JSON.stringify(projectForModel(result))}`);
    } catch {
      return this.fallback.executiveSummary(result); // never fail the request
    }
  }

  async explainFinding(finding: Finding, target: string): Promise<string> {
    try {
      const projection = {
        target,
        title: finding.title,
        priority: finding.priority,
        confidence: Math.round(finding.confidence * 100),
        observation: finding.observation,
        inference: finding.inference,
        concern: finding.concern,
        recommendation: finding.recommendation,
      };
      return await this.call(
        FINDING_PROMPT,
        `Finding:\n${JSON.stringify(projection)}`,
        300,
      );
    } catch {
      return this.fallback.explainFinding(finding, target);
    }
  }
}

export function getExplainer(): Explainer {
  const key = process.env.ANTHROPIC_API_KEY;
  return key ? new AnthropicExplainer(key) : new TemplateExplainer();
}
