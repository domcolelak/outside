/**
 * AbuseIPDB as a ProviderDefinition. All AbuseIPDB-specific logic stays in the
 * pure adapter it wraps; this file only adapts it to the shared framework.
 */

import { verifyKey, looksLikeAbuseIpdbKey } from "@/lib/integrations/abuseipdb";
import type { ProviderDefinition, ProviderValidation } from "./types";

async function validate(raw: string, signal?: AbortSignal): Promise<ProviderValidation> {
  const verification = await verifyKey(raw, signal);
  if (!verification.ok) {
    return { ok: false, code: verification.code, message: verification.message, status: verification.status, retryAfterSeconds: verification.retryAfterSeconds };
  }
  const { remaining, limit } = verification.quota;
  return {
    ok: true,
    accountLabel: limit !== null ? `${limit} checks/day` : "Connected",
    capabilities: [
      {
        id: "ip_reputation",
        label: "IP reputation checks",
        available: remaining === null || remaining > 0,
        detail:
          remaining === null
            ? undefined
            : remaining > 0
              ? `${remaining} check${remaining === 1 ? "" : "s"} left today`
              : "Daily allowance used up — it resets at midnight UTC",
      },
    ],
  };
}

export const abuseIpdbProvider: ProviderDefinition = {
  id: "abuseipdb",
  name: "AbuseIPDB",
  category: "reputation",
  summary: "Flags addresses your infrastructure resolves to that have been reported for abuse, using your own AbuseIPDB key.",
  credentialKind: "api_key",
  envKey: "ABUSEIPDB_API_KEY",
  runLabel: "AbuseIPDB",
  docsUrl: "https://www.abuseipdb.com/account/api",
  keyPlaceholder: "80-character key",
  looksValid: looksLikeAbuseIpdbKey,
  formatHint: "An AbuseIPDB API key is 80 hexadecimal characters.",
  validate,
};
