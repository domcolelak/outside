/**
 * Vercel as a ProviderDefinition. All Vercel-specific logic stays in the pure
 * adapter it wraps; this file only adapts it to the shared framework.
 */

import { verifyKey, ownedDomains, looksLikeVercelToken } from "@/lib/integrations/vercel";
import type { ProviderDefinition, ProviderValidation } from "./types";

async function validate(raw: string, signal?: AbortSignal): Promise<ProviderValidation> {
  const verification = await verifyKey(raw, signal);
  if (!verification.ok) {
    return { ok: false, code: verification.code, message: verification.message, status: verification.status, retryAfterSeconds: verification.retryAfterSeconds };
  }

  // Capability detection: attribution is only useful once the token can actually
  // read a domain list, so report what it can see rather than assuming.
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
            ? `${count} domain${count === 1 ? "" : "s"} available to attribute discovered assets against`
            : "This account owns no domains, so there is nothing to attribute against yet"
          : owned.message,
      },
    ],
  };
}

export const vercelProvider: ProviderDefinition = {
  id: "vercel",
  name: "Vercel",
  category: "attack_surface",
  summary:
    "Attributes discovered hostnames to the domains your Vercel account owns, so anything left unattributed stands out as a possible shadow asset. Read-only — OUTSIDE never writes to your Vercel account.",
  credentialKind: "api_key",
  envKey: "VERCEL_API_TOKEN",
  runLabel: "Vercel",
  docsUrl: "https://vercel.com/account/tokens",
  keyPlaceholder: "Vercel API token",
  looksValid: looksLikeVercelToken,
  formatHint: "A Vercel API token is a long alphanumeric string.",
  validate,
  async ownedDomains(raw, signal) {
    const result = await ownedDomains(raw, signal);
    return result.ok ? { ok: true, domains: result.domains } : { ok: false, message: result.message };
  },
};
