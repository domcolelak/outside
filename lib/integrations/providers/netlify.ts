/**
 * Netlify as a ProviderDefinition. All Netlify-specific logic stays in the pure
 * adapter it wraps; this file only adapts it to the shared framework.
 */

import { verifyKey, ownedDomains, looksLikeNetlifyToken } from "@/lib/integrations/netlify";
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
            ? `${count} DNS zone${count === 1 ? "" : "s"} available to attribute discovered assets against`
            : "This account manages no DNS zones, so there is nothing to attribute against yet"
          : owned.message,
      },
    ],
  };
}

export const netlifyProvider: ProviderDefinition = {
  id: "netlify",
  name: "Netlify",
  category: "attack_surface",
  summary:
    "Attributes discovered hostnames to the DNS zones your Netlify account manages, so anything left unattributed stands out as a possible shadow asset. Read-only — OUTSIDE never writes to your Netlify account.",
  credentialKind: "api_key",
  envKey: "NETLIFY_API_TOKEN",
  runLabel: "Netlify",
  docsUrl: "https://app.netlify.com/user/applications#personal-access-tokens",
  keyPlaceholder: "Netlify personal access token",
  looksValid: looksLikeNetlifyToken,
  formatHint: "A Netlify personal access token is a long alphanumeric string.",
  validate,
  async ownedDomains(raw, signal) {
    const result = await ownedDomains(raw, signal);
    return result.ok ? { ok: true, domains: result.domains } : { ok: false, message: result.message };
  },
};
