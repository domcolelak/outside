/**
 * Shodan as a ProviderDefinition. All Shodan-specific logic stays in the pure
 * adapter it wraps; this file only adapts it to the shared provider framework.
 */

import { verifyKey, looksLikeShodanKey } from "@/lib/integrations/shodan";
import type { ProviderDefinition, ProviderValidation } from "./types";

async function validate(raw: string, signal?: AbortSignal): Promise<ProviderValidation> {
  const verification = await verifyKey(raw, signal);
  if (!verification.ok) {
    return { ok: false, code: verification.code, message: verification.message, status: verification.status, retryAfterSeconds: verification.retryAfterSeconds };
  }
  const { plan, queryCredits } = verification.plan;
  if (plan && /academic|research|education|student/i.test(plan)) {
    return {
      ok: false,
      code: "forbidden",
      message: "Shodan academic and research access cannot be connected to this commercial service.",
    };
  }
  return {
    ok: true,
    accountLabel: plan ? `${plan} plan` : "Connected",
    capabilities: [
      {
        id: "passive_subdomains",
        label: "Passive subdomain discovery",
        available: queryCredits === null || queryCredits > 0,
        detail:
          queryCredits === null
            ? undefined
            : queryCredits > 0
              ? `${queryCredits} query credit${queryCredits === 1 ? "" : "s"} remaining`
              : "No query credits remaining — they reset with your billing cycle",
      },
    ],
  };
}

export const shodanProvider: ProviderDefinition = {
  id: "shodan",
  name: "Shodan",
  category: "attack_surface",
  summary: "Adds one page of proprietary DNS context per scan (one documented query credit). Additional pages are reported as partial instead of fetched automatically.",
  credentialKind: "api_key",
  envKey: "SHODAN_API_KEY",
  runLabel: "Shodan",
  docsUrl: "https://account.shodan.io",
  keyPlaceholder: "32-character key",
  looksValid: looksLikeShodanKey,
  formatHint: "A Shodan API key is 32 alphanumeric characters.",
  validate,
};
