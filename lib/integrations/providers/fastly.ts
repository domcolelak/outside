/**
 * Fastly as a ProviderDefinition. All Fastly-specific logic stays in the pure
 * adapter it wraps; this file only adapts it to the shared framework.
 */

import { verifyKey, ownedDomains, looksLikeFastlyToken } from "@/lib/integrations/fastly";
import type { ProviderDefinition, ProviderValidation } from "./types";

async function validate(raw: string, signal?: AbortSignal): Promise<ProviderValidation> {
  const verification = await verifyKey(raw, signal);
  if (!verification.ok) {
    return { ok: false, code: verification.code, message: verification.message, status: verification.status, retryAfterSeconds: verification.retryAfterSeconds };
  }
  const owned = await ownedDomains(raw, signal);
  const count = owned.ok ? owned.domains.length : 0;
  return {
    ok: true,
    accountLabel: verification.account,
    capabilities: [
      {
        id: "asset_attribution",
        label: "Asset attribution",
        available: owned.ok && count > 0,
        detail: owned.ok
          ? count > 0
            ? `${count} domain${count === 1 ? "" : "s"} served by this account's services`
            : "No services with domains were found on this account yet"
          : owned.message,
      },
    ],
  };
}

export const fastlyProvider: ProviderDefinition = {
  id: "fastly",
  name: "Fastly",
  category: "attack_surface",
  summary:
    "Attributes discovered hostnames to the domains your Fastly services serve, so anything left unattributed stands out as a possible shadow asset. Read-only — OUTSIDE never changes your Fastly configuration.",
  credentialKind: "api_key",
  envKey: "FASTLY_API_TOKEN",
  runLabel: "Fastly",
  docsUrl: "https://manage.fastly.com/account/personal/tokens",
  keyPlaceholder: "Read-scoped API token",
  looksValid: looksLikeFastlyToken,
  formatHint: "A Fastly API token is a long alphanumeric string.",
  validate,
  async ownedDomains(raw, signal) {
    const result = await ownedDomains(raw, signal);
    return result.ok ? { ok: true, domains: result.domains } : { ok: false, message: result.message };
  },
};
