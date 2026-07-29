/**
 * SecurityTrails as a ProviderDefinition. All SecurityTrails-specific logic
 * (endpoints, auth header, status semantics) stays in the pure adapter it wraps;
 * this file only adapts it to the shared provider framework.
 */

import { verifyKey, accountUsage, looksLikeSecurityTrailsKey } from "@/lib/integrations/securitytrails";
import type { ProviderDefinition, ProviderValidation } from "./types";

async function validate(raw: string, signal?: AbortSignal): Promise<ProviderValidation> {
  // /ping is the authoritative "this key works" signal and costs no quota.
  const verification = await verifyKey(raw, signal);
  if (!verification.ok) {
    return { ok: false, code: verification.code, message: verification.message, status: verification.status, retryAfterSeconds: verification.retryAfterSeconds };
  }

  // Capability detection: subdomain discovery is only useful while quota remains.
  const usage = await accountUsage(raw, signal);
  const quota = usage.ok ? usage.usage : null;
  const remaining = quota && quota.allowed !== null && quota.used !== null ? quota.allowed - quota.used : null;

  return {
    ok: true,
    accountLabel: quota && quota.allowed !== null ? `${quota.allowed} queries/month` : "Connected",
    capabilities: [
      {
        id: "passive_subdomains",
        label: "Passive subdomain discovery",
        available: remaining === null || remaining > 0,
        detail:
          remaining !== null
            ? remaining > 0
              ? `${remaining} of ${quota!.allowed} monthly queries remaining`
              : "Monthly query allowance used up — it resets with your billing cycle"
            : usage.ok
              ? undefined
              : usage.message,
      },
    ],
  };
}

export const securityTrailsProvider: ProviderDefinition = {
  id: "securitytrails",
  name: "SecurityTrails",
  category: "attack_surface",
  summary: "Finds subdomains that never appeared on a public certificate, using your own SecurityTrails API key.",
  credentialKind: "api_key",
  envKey: "SECURITYTRAILS_API_KEY",
  runLabel: "SecurityTrails",
  docsUrl: "https://securitytrails.com/app/account/credentials",
  keyPlaceholder: "SecurityTrails API key",
  looksValid: looksLikeSecurityTrailsKey,
  formatHint: "A SecurityTrails API key is a long alphanumeric string.",
  validate,
};
