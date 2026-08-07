/**
 * GitHub as a ProviderDefinition. All GitHub-specific logic stays in the pure
 * adapter it wraps; this file only adapts it to the shared framework.
 */

import { verifyKey, ownedDomains, looksLikeGitHubToken } from "@/lib/integrations/github";
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
        label: "Pages domain attribution",
        available: owned.ok && count > 0,
        detail: owned.ok
          ? count > 0
            ? `${count} GitHub Pages custom domain${count === 1 ? "" : "s"} available to attribute discovered assets against`
            : "No GitHub Pages site with a custom domain was found, so there is nothing to attribute against yet"
          : owned.message,
      },
    ],
  };
}

export const gitHubProvider: ProviderDefinition = {
  id: "github",
  name: "GitHub",
  category: "attack_surface",
  summary:
    "Attributes discovered hostnames to the custom domains on your GitHub Pages sites — real external surface that is easy to forget. Read-only, and a read-scoped token is enough.",
  credentialKind: "api_key",
  envKey: "GITHUB_APP_TOKEN",
  runLabel: "GitHub",
  docsUrl: "https://github.com/settings/tokens",
  keyPlaceholder: "Read-scoped personal access token",
  looksValid: looksLikeGitHubToken,
  formatHint: "A GitHub personal access token is a long alphanumeric string.",
  validate,
  async ownedDomains(raw, signal) {
    const result = await ownedDomains(raw, signal);
    return result.ok ? { ok: true, domains: result.domains } : { ok: false, message: result.message };
  },
};
