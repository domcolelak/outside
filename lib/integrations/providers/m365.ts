/**
 * Microsoft 365 as a ProviderDefinition. All M365-specific logic stays in the
 * pure adapter it wraps; this file only adapts it to the shared framework.
 */

import { verifyKey, ownedDomains } from "@/lib/integrations/m365";
import { looksLikeMicrosoftCredential, splitMicrosoftCredential } from "@/lib/integrations/microsoft-oauth";
import type { ProviderDefinition, ProviderValidation } from "./types";

async function validate(raw: string, signal?: AbortSignal): Promise<ProviderValidation> {
  const verification = await verifyKey(raw, signal);
  if (!verification.ok) {
    return { ok: false, code: verification.code, message: verification.message, status: verification.status, retryAfterSeconds: verification.retryAfterSeconds };
  }

  const unverified = verification.total - verification.verified;
  return {
    ok: true,
    accountLabel: verification.account,
    capabilities: [
      {
        id: "asset_attribution",
        label: "Asset attribution",
        available: verification.verified > 0,
        detail:
          verification.verified > 0
            ? `${verification.verified} verified domain${verification.verified === 1 ? "" : "s"} available to attribute discovered assets against${unverified > 0 ? `; ${unverified} unverified domain${unverified === 1 ? "" : "s"} ignored` : ""}`
            : "This tenant has no verified domains — only verified ones are used, because an unverified domain is claimed rather than proven",
      },
    ],
  };
}

export const m365Provider: ProviderDefinition = {
  id: "m365",
  name: "Microsoft 365",
  category: "attack_surface",
  summary:
    "Attributes discovered hostnames to the domains your Microsoft 365 tenant has verified. Read-only — Domain.Read.All is the only permission needed, and unverified domains are ignored.",
  credentialKind: "tenant_client_secret",
  envKey: "M365_CLIENT_ID",
  runLabel: "Microsoft 365",
  expandEnv(raw): Record<string, string> {
    const cred = splitMicrosoftCredential(raw);
    return cred ? { M365_TENANT_ID: cred.tenantId, M365_CLIENT_ID: cred.clientId, M365_CLIENT_SECRET: cred.clientSecret } : {};
  },
  docsUrl: "https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade",
  keyPlaceholder: "Client secret",
  looksValid: looksLikeMicrosoftCredential,
  formatHint: "Enter the directory (tenant) ID, the application (client) ID and the client secret.",
  validate,
  async ownedDomains(raw, signal) {
    const result = await ownedDomains(raw, signal);
    return result.ok ? { ok: true, domains: result.domains } : { ok: false, message: result.message };
  },
};
