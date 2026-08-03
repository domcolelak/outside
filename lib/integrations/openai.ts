/**
 * OpenAI — BYOK (bring your own key) adapter.
 *
 * Pure provider logic: no storage, no auth, no HTTP framework. The key travels
 * as a bearer token.
 *
 * This credential only ever pays for calls the LLM gateway makes, and the
 * gateway redacts secrets and PII before anything leaves the process. Connecting
 * an organization key changes who is billed, never what is sent.
 *
 * The key is passed in explicitly (from the organization's encrypted credential)
 * and is never logged, returned, or placed in an error message.
 */

import { providerGet, mapProviderStatus, networkFailure, type ProviderFailure } from "@/lib/integrations/providers/http";

const API = "https://api.openai.com/v1";
const LABEL = "OpenAI";
/** The default model the gateway uses; capability detection checks for it. */
const DEFAULT_MODEL = "gpt-4o-mini";

export interface OpenAiAccess {
  /** Models the key can list, capped — used only to report capability. */
  modelCount: number;
  /** Whether the model the gateway defaults to is available to this key. */
  hasDefaultModel: boolean;
}

export type OpenAiResult<T> = ({ ok: true } & T) | ProviderFailure;

/**
 * Prove the key works. /models is the cheapest authenticated endpoint — it is
 * not a completion, so testing a connection consumes no tokens and costs the
 * customer nothing.
 */
export async function verifyKey(key: string, signal?: AbortSignal): Promise<OpenAiResult<{ access: OpenAiAccess }>> {
  try {
    const { status, body, retryAfter } = await providerGet(`${API}/models`, { authorization: `Bearer ${key}` }, signal);
    if (status !== 200) {
      return mapProviderStatus(status, {
        label: LABEL,
        retryAfter,
        forbidden: "Rejected by OpenAI — the key may lack model access, or its project has no active billing.",
      });
    }
    const data = body && typeof body === "object" ? (body as { data?: unknown }).data : null;
    const models = Array.isArray(data) ? data : [];
    const ids = models
      .map((entry) => (entry && typeof entry === "object" ? (entry as { id?: unknown }).id : null))
      .filter((id): id is string => typeof id === "string");
    return {
      ok: true,
      access: { modelCount: ids.length, hasDefaultModel: ids.includes(DEFAULT_MODEL) },
    };
  } catch {
    return networkFailure(LABEL);
  }
}

/**
 * OpenAI keys are opaque and their prefixes have changed over time (sk-, sk-proj-…),
 * so only obvious rubbish is rejected locally; the live test is the real check.
 */
export function looksLikeOpenAiKey(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("sk-") && trimmed.length >= 20 && !/\s/.test(trimmed);
}
