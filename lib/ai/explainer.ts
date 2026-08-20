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
import { providerKey } from "@/lib/integrations/credential-context";
import { DEFAULT_LOCALE, localeMeta, type Locale } from "@/lib/i18n/locales";
import { findingText } from "@/lib/report/finding-text";
import { getTranslator } from "@/lib/i18n/messages";

/** Prompt identity for audit/reproducibility through the gateway. */
const EXPLAINER_PROMPT_VERSION = "explainer-v1";

export type ExplainerKind = "template" | "openai";

export interface Explainer {
  readonly kind: ExplainerKind;
  /** A plain-English executive summary of the external surface. */
  executiveSummary(result: ScanResult, locale?: Locale): Promise<string>;
  /** A plain-English explanation of a single finding. */
  explainFinding(finding: Finding, target: string, locale?: Locale): Promise<string>;
}

/** Deterministic, zero-dependency explainer. Always available. */
export class TemplateExplainer implements Explainer {
  readonly kind = "template" as const;
  async executiveSummary(result: ScanResult, locale: Locale = DEFAULT_LOCALE): Promise<string> {
    return buildExecutiveSummary(result, locale);
  }
  async explainFinding(f: Finding, target: string, locale: Locale = DEFAULT_LOCALE): Promise<string> {
    const tr = getTranslator(locale);
    const copy = findingText(f, locale);
    return tr.t("scan", "findingExplanation", { target, observation: copy.observation, inference: copy.inference ?? "", concern: copy.concern, priority: tr.t("ui", `priority${f.priority[0]!.toUpperCase()}${f.priority.slice(1)}` as Parameters<typeof tr.t<"ui">>[1]), confidence: Math.round(f.confidence * 100), recommendation: copy.recommendation });
  }
}

/**
 * Compact, evidence-bounded projection of a scan for the model. We deliberately
 * pass only derived facts (never raw internals) and instruct the model to
 * rephrase — not to add findings.
 */
function projectForModel(result: ScanResult, locale: Locale) {
  return {
    target: result.target,
    isDemo: result.isDemo,
    score: result.score.value,
    band: result.score.band,
    stats: result.stats,
    findings: result.findings.slice(0, 12).map((f: Finding) => ({
      title: findingText(f, locale).title,
      priority: f.priority,
      confidence: Math.round(f.confidence * 100),
      asset: f.assetId,
      observation: findingText(f, locale).observation,
      concern: findingText(f, locale).concern,
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

  async executiveSummary(result: ScanResult, locale: Locale = DEFAULT_LOCALE): Promise<string> {
    try {
      return await this.call(`${executiveSummaryPrompt()}\nWrite the answer only in ${localeMeta(locale).language}.`, `Scan projection:\n${JSON.stringify(projectForModel(result, locale))}`);
    } catch {
      return this.fallback.executiveSummary(result, locale); // never fail the request
    }
  }

  async explainFinding(finding: Finding, target: string, locale: Locale = DEFAULT_LOCALE): Promise<string> {
    try {
      const projection = {
        target,
        title: findingText(finding, locale).title,
        priority: finding.priority,
        confidence: Math.round(finding.confidence * 100),
        observation: findingText(finding, locale).observation,
        inference: findingText(finding, locale).inference,
        concern: findingText(finding, locale).concern,
        recommendation: findingText(finding, locale).recommendation,
      };
      return await this.call(`${findingExplanationPrompt()}\nWrite the answer only in ${localeMeta(locale).language}.`, `Finding:\n${JSON.stringify(projection)}`, 300);
    } catch {
      return this.fallback.explainFinding(finding, target, locale);
    }
  }
}

/**
 * The hosted explainer when a model key is available — the organization's own
 * connected key first, then the platform key — else the deterministic template.
 */
export function getExplainer(): Explainer {
  const key = providerKey("OPENAI_API_KEY");
  return key ? new OpenAIExplainer(key) : new TemplateExplainer();
}
