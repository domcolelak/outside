/**
 * AI explanation layer — provider-abstracted and strictly read-only.
 *
 * Hard guardrail: an explainer receives the already-finalized ScanResult and
 * returns natural-language text ONLY. It can never create assets, findings,
 * evidence, or scores — the deterministic pipeline owns all of those. The
 * default TemplateExplainer needs no API key, so the product always works;
 * OpenAIExplainer is used when OPENAI_API_KEY is present and degrades to the
 * template on any error.
 */

import type { Finding, ScanResult } from "@/lib/types";
import { buildExecutiveSummary } from "@/lib/report/summary";
import { executeModelCall } from "./gateway";
import { executiveSummaryPrompt, findingExplanationPrompt } from "./constitution";
import { ConstitutionViolation, findConstitutionViolations } from "./guardrails";
import { operationalLog } from "@/lib/observability/log";

/** Prompt identity for audit/reproducibility through the gateway. */
const EXPLAINER_PROMPT_VERSION = "explainer-v1";

export type ExplainerKind = "template" | "openai";

export interface Explainer {
  readonly kind: ExplainerKind;
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

/** OpenAI Chat Completions. Active when OPENAI_API_KEY is present. */
export class OpenAIExplainer implements Explainer {
  readonly kind = "openai" as const;
  constructor(
    private apiKey: string,
    private model = process.env.OUTSIDE_OPENAI_MODEL ?? "gpt-4o-mini",
    private fallback: Explainer = new TemplateExplainer(),
  ) {}

  private async call(system: string, userContent: string, maxTokens = 400): Promise<string> {
    // Every hosted-model call goes through the governed LLM Gateway (redaction,
    // budget, cost accounting, concurrency, retries, audit).
    const { text } = await executeModelCall({
      taskType: "scan_explanation",
      promptVersion: EXPLAINER_PROMPT_VERSION,
      system,
      user: userContent,
      maxTokens,
      temperature: 0.3,
      maxCostUsd: 0.05,
      apiKey: this.apiKey,
      model: this.model,
    });
    // Deterministic enforcement of the Aegis Constitution on the output. A
    // violation is fatal here — it propagates to the template fallback.
    const violations = findConstitutionViolations(text, userContent);
    if (violations.length) {
      operationalLog("error", "aegis.constitution_violation", { violations, model: this.model });
      throw new ConstitutionViolation(violations);
    }
    return text;
  }

  async executiveSummary(result: ScanResult): Promise<string> {
    try {
      return await this.call(executiveSummaryPrompt(), `Scan projection:\n${JSON.stringify(projectForModel(result))}`);
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
      return await this.call(findingExplanationPrompt(), `Finding:\n${JSON.stringify(projection)}`, 300);
    } catch {
      return this.fallback.explainFinding(finding, target);
    }
  }
}

/** The hosted explainer when OPENAI_API_KEY is set, else the deterministic template. */
export function getExplainer(): Explainer {
  const key = process.env.OPENAI_API_KEY;
  return key ? new OpenAIExplainer(key) : new TemplateExplainer();
}
