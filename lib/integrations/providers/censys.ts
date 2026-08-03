/**
 * Censys as a ProviderDefinition. All Censys-specific logic stays in the pure
 * adapter it wraps; this file only adapts it to the shared framework.
 *
 * Censys is the framework's pair-credential case: one stored value expands into
 * the two environment variables the scan pipeline reads.
 */

import { verifyKey, looksLikeCensysCredential, splitCensysCredential } from "@/lib/integrations/censys";
import type { ProviderDefinition, ProviderValidation } from "./types";

async function validate(raw: string, signal?: AbortSignal): Promise<ProviderValidation> {
  const verification = await verifyKey(raw, signal);
  if (!verification.ok) {
    return { ok: false, code: verification.code, message: verification.message, status: verification.status, retryAfterSeconds: verification.retryAfterSeconds };
  }
  const { used, allowance } = verification.account;
  const remaining = used !== null && allowance !== null ? allowance - used : null;
  return {
    ok: true,
    accountLabel: allowance !== null ? `${allowance} queries/month` : "Connected",
    capabilities: [
      {
        id: "service_discovery",
        label: "Exposed service discovery",
        available: remaining === null || remaining > 0,
        detail:
          remaining !== null
            ? remaining > 0
              ? `${remaining} of ${allowance} monthly queries remaining`
              : "Monthly query allowance used up — it resets with your Censys billing period"
            : undefined,
      },
    ],
  };
}

export const censysProvider: ProviderDefinition = {
  id: "censys",
  name: "Censys",
  category: "attack_surface",
  summary:
    "Reports non-web services (SSH, databases, RDP, message brokers) observed on your resolved public addresses, using your own Censys API ID and secret.",
  credentialKind: "id_secret",
  // The primary variable, kept for identity; expandEnv below supplies both.
  envKey: "CENSYS_API_ID",
  runLabel: "Censys",
  expandEnv(raw): Record<string, string> {
    const pair = splitCensysCredential(raw);
    return pair ? { CENSYS_API_ID: pair.id, CENSYS_API_SECRET: pair.secret } : {};
  },
  docsUrl: "https://search.censys.io/account/api",
  keyPlaceholder: "API ID and API secret",
  looksValid: looksLikeCensysCredential,
  formatHint: "Enter both the Censys API ID and the API secret.",
  validate,
};
