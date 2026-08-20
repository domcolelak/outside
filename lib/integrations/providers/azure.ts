/**
 * Azure as a ProviderDefinition. All Azure-specific logic stays in the pure
 * adapter it wraps; this file only adapts it to the shared framework.
 */

import { verifyKey, ownedDomains } from "@/lib/integrations/azure";
import { looksLikeMicrosoftCredential, splitMicrosoftCredential } from "@/lib/integrations/microsoft-oauth";
import type { ProviderDefinition, ProviderValidation } from "./types";

async function validate(raw: string, signal?: AbortSignal): Promise<ProviderValidation> {
  const verification = await verifyKey(raw, signal);
  if (!verification.ok) {
    return { ok: false, code: verification.code, message: verification.message, status: verification.status, retryAfterSeconds: verification.retryAfterSeconds };
  }

  // A valid application with no role assignment sees no subscriptions. That is
  // connected-but-not-yet-useful, and saying so is more helpful than a bare tick.
  const owned = await ownedDomains(raw, signal);
  const count = owned.ok ? owned.domains.length : 0;
  return {
    ok: true,
    accountLabel: `${verification.account} · ${verification.subscriptions} subscription${verification.subscriptions === 1 ? "" : "s"} readable`,
    capabilities: [
      {
        id: "asset_attribution",
        label: "Asset attribution",
        available: owned.ok && count > 0,
        detail: owned.ok
          ? count > 0
            ? `${count} Azure DNS zone${count === 1 ? "" : "s"} available to attribute discovered assets against`
            : verification.subscriptions === 0
              ? "The application can sign in but reads no subscriptions — assign it the Reader role"
              : "No Azure DNS zones were found in the readable subscriptions"
          : owned.message,
      },
    ],
  };
}

export const azureProvider: ProviderDefinition = {
  id: "azure",
  name: "Azure",
  category: "attack_surface",
  summary:
    "Attributes discovered hostnames to your Azure DNS zones, so anything left unattributed stands out as a possible shadow asset. Read-only — the Reader role is all the application needs.",
  credentialKind: "tenant_client_secret",
  envKey: "AZURE_CLIENT_ID",
  envKeys: ["AZURE_TENANT_ID", "AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET"],
  runLabel: "Azure",
  expandEnv(raw): Record<string, string> {
    const cred = splitMicrosoftCredential(raw);
    return cred
      ? { AZURE_TENANT_ID: cred.tenantId, AZURE_CLIENT_ID: cred.clientId, AZURE_CLIENT_SECRET: cred.clientSecret }
      : {};
  },
  docsUrl: "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade",
  keyPlaceholder: "Client secret",
  looksValid: looksLikeMicrosoftCredential,
  formatHint: "Enter the directory (tenant) ID, the application (client) ID and the client secret.",
  validate,
  async ownedDomains(raw, signal) {
    const result = await ownedDomains(raw, signal);
    return result.ok ? { ok: true, domains: result.domains } : { ok: false, message: result.message };
  },
};
