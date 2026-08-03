/**
 * OpenAI as a ProviderDefinition. All OpenAI-specific logic stays in the pure
 * adapter it wraps; this file only adapts it to the shared framework.
 */

import { verifyKey, looksLikeOpenAiKey } from "@/lib/integrations/openai";
import type { ProviderDefinition, ProviderValidation } from "./types";

async function validate(raw: string, signal?: AbortSignal): Promise<ProviderValidation> {
  const verification = await verifyKey(raw, signal);
  if (!verification.ok) {
    return { ok: false, code: verification.code, message: verification.message, status: verification.status, retryAfterSeconds: verification.retryAfterSeconds };
  }
  const { modelCount, hasDefaultModel } = verification.access;
  return {
    ok: true,
    accountLabel: `${modelCount} model${modelCount === 1 ? "" : "s"} available`,
    capabilities: [
      {
        id: "scan_explanations",
        label: "AI explanations",
        available: hasDefaultModel,
        detail: hasDefaultModel
          ? "Explanations are generated with your key and billed to your OpenAI account"
          : "This key cannot reach the model OUTSIDE uses — explanations stay on the deterministic template",
      },
    ],
  };
}

export const openAiProvider: ProviderDefinition = {
  id: "openai",
  name: "OpenAI",
  category: "ai",
  summary:
    "Generates plain-English explanations of findings using your own OpenAI key. Read-only over deterministic results — it can never add assets, findings or scores, and secrets and personal data are redacted before any call.",
  credentialKind: "api_key",
  envKey: "OPENAI_API_KEY",
  // AI enrichment is not a scan provider, so it reports no ProviderRun. The label
  // is still unique, which the registry invariants require.
  runLabel: "OpenAI",
  docsUrl: "https://platform.openai.com/api-keys",
  keyPlaceholder: "sk-…",
  looksValid: looksLikeOpenAiKey,
  formatHint: "An OpenAI API key starts with sk- and is at least 20 characters.",
  validate,
};
