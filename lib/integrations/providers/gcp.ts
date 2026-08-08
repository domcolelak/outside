/**
 * Google Cloud as a ProviderDefinition. All GCP-specific logic stays in the pure
 * adapter it wraps; this file only adapts it to the shared framework.
 */

import { verifyKey, ownedDomains } from "@/lib/integrations/gcp";
import { looksLikeServiceAccount, parseServiceAccount } from "@/lib/integrations/google-oauth";
import type { ProviderDefinition, ProviderValidation } from "./types";

async function validate(raw: string, signal?: AbortSignal): Promise<ProviderValidation> {
  const verification = await verifyKey(raw, signal);
  if (!verification.ok) {
    return { ok: false, code: verification.code, message: verification.message, status: verification.status, retryAfterSeconds: verification.retryAfterSeconds };
  }
  return {
    ok: true,
    accountLabel: verification.account,
    capabilities: [
      {
        id: "asset_attribution",
        label: "Asset attribution",
        available: verification.zones > 0,
        detail:
          verification.zones > 0
            ? `${verification.zones} Cloud DNS zone${verification.zones === 1 ? "" : "s"} available to attribute discovered assets against`
            : "This project has no Cloud DNS managed zones, so there is nothing to attribute against yet",
      },
    ],
  };
}

export const gcpProvider: ProviderDefinition = {
  id: "gcp",
  name: "Google Cloud",
  category: "attack_surface",
  summary:
    "Attributes discovered hostnames to your Cloud DNS managed zones, so anything left unattributed stands out as a possible shadow asset. Read-only — the DNS Reader role is all the service account needs.",
  credentialKind: "service_account_json",
  envKey: "GCP_SERVICE_ACCOUNT_JSON",
  runLabel: "Google Cloud",
  docsUrl: "https://console.cloud.google.com/iam-admin/serviceaccounts",
  keyPlaceholder: "Paste the service-account JSON key file",
  looksValid: looksLikeServiceAccount,
  formatHint: "Paste the service-account JSON key file exactly as Google issued it.",
  validate,
  expandEnv(raw): Record<string, string> {
    // Kept whole: the scan-side client parses the same file the customer pasted.
    return parseServiceAccount(raw) ? { GCP_SERVICE_ACCOUNT_JSON: raw } : {};
  },
  async ownedDomains(raw, signal) {
    const result = await ownedDomains(raw, signal);
    return result.ok ? { ok: true, domains: result.domains } : { ok: false, message: result.message };
  },
};
