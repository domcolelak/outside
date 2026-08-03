/**
 * VirusTotal as a ProviderDefinition. All VirusTotal-specific logic stays in the
 * pure adapter it wraps; this file only adapts it to the shared framework.
 */

import { verifyKey, looksLikeVirusTotalKey } from "@/lib/integrations/virustotal";
import type { ProviderDefinition, ProviderValidation } from "./types";

async function validate(raw: string, signal?: AbortSignal): Promise<ProviderValidation> {
  const verification = await verifyKey(raw, signal);
  if (!verification.ok) {
    return { ok: false, code: verification.code, message: verification.message, status: verification.status, retryAfterSeconds: verification.retryAfterSeconds };
  }

  const { plan, dailyAllowed, dailyUsed, privileged } = verification.account;
  if (!privileged) {
    return {
      ok: false,
      code: "forbidden",
      message:
        "VirusTotal Public API keys cannot be connected to this commercial service. Use a key covered by a Premium or commercial agreement.",
    };
  }
  const remaining = dailyAllowed !== null && dailyUsed !== null ? dailyAllowed - dailyUsed : null;

  return {
    ok: true,
    accountLabel: plan ? `${plan} account` : "Connected",
    capabilities: [
      {
        id: "domain_reputation",
        label: "Domain reputation",
        available: remaining === null || remaining > 0,
        detail:
          remaining !== null
            ? remaining > 0
              ? `${remaining} of ${dailyAllowed} daily requests remaining`
              : "Daily request allowance used up — it resets on VirusTotal's schedule"
            : undefined,
      },
      {
        id: "commercial_licence",
        label: "Commercial use",
        available: true,
        detail: "VirusTotal reports a privileged entitlement on this key",
      },
    ],
  };
}

export const virusTotalProvider: ProviderDefinition = {
  id: "virustotal",
  name: "VirusTotal",
  category: "reputation",
  summary: "Aggregates security-vendor verdicts on your domains, using your own VirusTotal API key. Requires a key licensed for commercial use.",
  credentialKind: "api_key",
  envKey: "VIRUSTOTAL_API_KEY",
  runLabel: "VirusTotal",
  docsUrl: "https://www.virustotal.com/gui/my-apikey",
  keyPlaceholder: "64-character key",
  looksValid: looksLikeVirusTotalKey,
  formatHint: "A VirusTotal API key is 64 hexadecimal characters.",
  validate,
};
