/**
 * GreyNoise as a ProviderDefinition. All GreyNoise-specific logic stays in the
 * pure adapter it wraps; this file only adapts it to the shared framework.
 */

import { verifyKey, looksLikeGreyNoiseKey } from "@/lib/integrations/greynoise";
import type { ProviderDefinition, ProviderValidation } from "./types";

async function validate(raw: string, signal?: AbortSignal): Promise<ProviderValidation> {
  const verification = await verifyKey(raw, signal);
  if (!verification.ok) {
    return { ok: false, code: verification.code, message: verification.message, status: verification.status, retryAfterSeconds: verification.retryAfterSeconds };
  }
  return {
    ok: true,
    accountLabel: "Community API",
    capabilities: [
      {
        id: "ip_classification",
        label: "Internet-noise classification",
        available: true,
        detail: "Separates addresses seen scanning the internet from benign common services",
      },
    ],
  };
}

export const greyNoiseProvider: ProviderDefinition = {
  id: "greynoise",
  name: "GreyNoise",
  category: "reputation",
  summary: "Tells opportunistic internet background noise apart from traffic that matters, using a commercially licensed GreyNoise key.",
  credentialKind: "api_key",
  envKey: "GREYNOISE_API_KEY",
  runLabel: "GreyNoise",
  docsUrl: "https://viz.greynoise.io/account",
  keyPlaceholder: "GreyNoise API key",
  looksValid: looksLikeGreyNoiseKey,
  formatHint: "A GreyNoise API key is a long alphanumeric string.",
  validate,
  ...(process.env.OUTSIDE_GREYNOISE_BYOK_COMMERCIAL_ALLOWED === "true"
    ? {}
    : {
        commercialGate: {
          reason:
            "GreyNoise Community access is non-commercial. This connector stays disabled until the operator confirms a GreyNoise agreement that permits customer-facing BYOK use.",
        },
      }),
};
