/**
 * DigitalOcean as a ProviderDefinition. All DigitalOcean-specific logic stays in
 * the pure adapter it wraps; this file only adapts it to the shared framework.
 */

import { verifyKey, ownedDomains, looksLikeDigitalOceanToken } from "@/lib/integrations/digitalocean";
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
            ? `${count} domain${count === 1 ? "" : "s"} available to attribute discovered assets against`
            : "This account holds no domains, so there is nothing to attribute against yet"
          : owned.message,
      },
    ],
  };
}

export const digitalOceanProvider: ProviderDefinition = {
  id: "digitalocean",
  name: "DigitalOcean",
  category: "attack_surface",
  summary:
    "Attributes discovered hostnames to the domains your DigitalOcean account holds, so anything left unattributed stands out as a possible shadow asset. Read-only — a read-scoped token is enough, and OUTSIDE never writes to your account.",
  credentialKind: "api_key",
  envKey: "DIGITALOCEAN_TOKEN",
  runLabel: "DigitalOcean",
  docsUrl: "https://cloud.digitalocean.com/account/api/tokens",
  keyPlaceholder: "Read-scoped API token",
  looksValid: looksLikeDigitalOceanToken,
  formatHint: "A DigitalOcean API token is a long alphanumeric string.",
  validate,
  async ownedDomains(raw, signal) {
    const result = await ownedDomains(raw, signal);
    return result.ok ? { ok: true, domains: result.domains } : { ok: false, message: result.message };
  },
};
