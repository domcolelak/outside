/**
 * Google Workspace as a ProviderDefinition. All Workspace-specific logic stays
 * in the pure adapter it wraps; this file only adapts it to the shared framework.
 */

import { verifyKey, ownedDomains, looksLikeWorkspaceCredential } from "@/lib/integrations/google-workspace";
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
            : "This Workspace has no verified domains — only verified ones are used, because an unverified domain is claimed rather than proven",
      },
    ],
  };
}

export const googleWorkspaceProvider: ProviderDefinition = {
  id: "google_workspace",
  name: "Google Workspace",
  category: "attack_surface",
  summary:
    "Attributes discovered hostnames to the domains your Google Workspace has verified. Read-only, through domain-wide delegation of the directory read-only scope; unverified domains are ignored.",
  credentialKind: "service_account_json_subject",
  envKey: "GOOGLE_WORKSPACE_CREDENTIAL",
  runLabel: "Google Workspace",
  docsUrl: "https://admin.google.com/ac/owl/domainwidedelegation",
  keyPlaceholder: "Paste the service-account JSON key file",
  looksValid: looksLikeWorkspaceCredential,
  formatHint: "Enter the administrator address to impersonate, then paste the service-account JSON key.",
  validate,
  expandEnv(raw): Record<string, string> {
    return looksLikeWorkspaceCredential(raw) ? { GOOGLE_WORKSPACE_CREDENTIAL: raw } : {};
  },
  async ownedDomains(raw, signal) {
    const result = await ownedDomains(raw, signal);
    return result.ok ? { ok: true, domains: result.domains } : { ok: false, message: result.message };
  },
};
