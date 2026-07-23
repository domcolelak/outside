/**
 * LLM Gateway — the single, governed chokepoint for every external model call.
 *
 * No component may call a hosted model directly. Requests go through here so the
 * gateway can, in one place: redact secrets/PII before anything leaves the
 * process, enforce a per-call cost budget, account real token cost, bound
 * concurrency and retry transient failures, and write a PII-free audit record of
 * every call (task, prompt version, model, tokens, cost, tenant, outcome).
 *
 * It is a mechanism, not a decision-maker: it transports and governs; it never
 * decides product truth. Deterministic guardrails on the *output* remain the
 * caller's responsibility (see lib/ai/guardrails.ts).
 */

import { operationalLog } from "@/lib/observability/log";
import { isTransientHttp, retryTransient, Semaphore } from "./resilience";

// Bounds concurrent hosted-model calls across the whole process.
const gatewaySemaphore = new Semaphore(4);

// Per-1K-token USD prices (input, output). Conservative; used for budget + accounting.
const MODEL_PRICES: Record<string, { in: number; out: number }> = {
  "gpt-4o-mini": { in: 0.00015, out: 0.0006 },
  "gpt-4o": { in: 0.005, out: 0.015 },
};
const DEFAULT_PRICE = { in: 0.001, out: 0.003 };
const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";

export interface ModelRequest {
  /** What the call is for (audit + routing). */
  taskType: string;
  /** Versioned prompt identity (audit + reproducibility). */
  promptVersion: string;
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
  /** Reject the call if the estimated worst-case cost exceeds this. */
  maxCostUsd?: number;
  /** Tenant context for the audit record — never sent to the model. */
  tenantId?: string | null;
  /** Overrides for tests / explicit routing; default to env. */
  apiKey?: string;
  model?: string;
  signal?: AbortSignal;
}

export interface ModelResult {
  text: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}

export class ModelBudgetError extends Error {
  constructor(message: string) { super(message); this.name = "ModelBudgetError"; }
}

export function gatewayConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY?.trim();
}

/** Strip secret- and PII-shaped substrings before any text can leave the process. */
export function redactForModel(text: string): string {
  return text
    .replace(/\b(?:sk|rk|pk|ghp|gho|GOCSPX|xox[baprs])[-_][A-Za-z0-9_-]{8,}\b/g, "[redacted-secret]")
    .replace(/\bBearer\s+[A-Za-z0-9._-]{12,}/gi, "Bearer [redacted]")
    .replace(/\b[A-Fa-f0-9]{32,}\b/g, "[redacted-hex]")
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b/g, "[redacted-email]");
}

function priceFor(model: string): { in: number; out: number } {
  return MODEL_PRICES[model] ?? DEFAULT_PRICE;
}

/** Worst-case pre-flight cost (all completion tokens billed at output rate). ~4 chars/token. */
export function estimateMaxCostUsd(model: string, promptChars: number, maxTokens: number): number {
  const p = priceFor(model);
  return (Math.ceil(promptChars / 4) / 1000) * p.in + (maxTokens / 1000) * p.out;
}

/** The single gateway through which every hosted-model call flows. */
export async function executeModelCall(req: ModelRequest): Promise<ModelResult> {
  const key = req.apiKey ?? process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("LLM gateway is not configured (no model provider key).");
  const model = req.model ?? process.env.OUTSIDE_OPENAI_MODEL ?? "gpt-4o-mini";

  // Redact BEFORE anything leaves the process.
  const system = redactForModel(req.system);
  const user = redactForModel(req.user);

  // Pre-flight budget enforcement.
  const ceiling = estimateMaxCostUsd(model, system.length + user.length, req.maxTokens);
  if (req.maxCostUsd !== undefined && ceiling > req.maxCostUsd) {
    throw new ModelBudgetError(`Estimated cost $${ceiling.toFixed(4)} exceeds the $${req.maxCostUsd} budget for ${req.taskType}.`);
  }

  const started = Date.now();
  const audit = (outcome: "ok" | "error", extra: Record<string, unknown>) =>
    operationalLog(outcome === "ok" ? "info" : "warn", "ai.gateway.call", {
      taskType: req.taskType, promptVersion: req.promptVersion, model, tenantId: req.tenantId ?? null,
      durationMs: Date.now() - started, outcome, ...extra,
    });

  const once = async (): Promise<ModelResult> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    const signal = req.signal ? AbortSignal.any([req.signal, controller.signal]) : controller.signal;
    try {
      const res = await fetch(OPENAI_ENDPOINT, {
        method: "POST", signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model, max_tokens: req.maxTokens, temperature: req.temperature ?? 0.3,
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
        }),
      });
      if (!res.ok) {
        const err = new Error(`OpenAI API ${res.status}`) as Error & { status?: number };
        err.status = res.status;
        throw err;
      }
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
      const text = data.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error("Empty AI response");
      const promptTokens = data.usage?.prompt_tokens ?? Math.ceil((system.length + user.length) / 4);
      const completionTokens = data.usage?.completion_tokens ?? Math.ceil(text.length / 4);
      const p = priceFor(model);
      const costUsd = (promptTokens / 1000) * p.in + (completionTokens / 1000) * p.out;
      return { text, model, promptTokens, completionTokens, costUsd };
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    const result = await gatewaySemaphore.run(() => retryTransient(once, isTransientHttp, { maxAttempts: 4, baseDelay: 500, maxDelay: 8000 }));
    audit("ok", { promptTokens: result.promptTokens, completionTokens: result.completionTokens, costUsd: Number(result.costUsd.toFixed(6)) });
    return result;
  } catch (error) {
    audit("error", { error: (error as Error).message });
    throw error;
  }
}
