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
}

/** Deterministic, zero-dependency explainer. Always available. */
export class TemplateExplainer implements Explainer {
  readonly kind = "template" as const;
  async executiveSummary(result: ScanResult): Promise<string> {
    return buildExecutiveSummary(result);
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

export class AnthropicExplainer implements Explainer {
  readonly kind = "anthropic" as const;
  constructor(
    private apiKey: string,
    private model = process.env.OUTSIDE_AI_MODEL ?? "claude-sonnet-5",
    private fallback: Explainer = new TemplateExplainer(),
  ) {}

  async executiveSummary(result: ScanResult): Promise<string> {
    try {
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
          max_tokens: 400,
          system: SYSTEM_PROMPT,
          messages: [
            { role: "user", content: `Scan projection:\n${JSON.stringify(projectForModel(result))}` },
          ],
        }),
      }).finally(() => clearTimeout(timer));

      if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
      const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
      const text = data.content?.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
      if (!text) throw new Error("Empty AI response");
      return text;
    } catch {
      // Never fail the request — degrade to the deterministic summary.
      return this.fallback.executiveSummary(result);
    }
  }
}

export function getExplainer(): Explainer {
  const key = process.env.ANTHROPIC_API_KEY;
  return key ? new AnthropicExplainer(key) : new TemplateExplainer();
}
