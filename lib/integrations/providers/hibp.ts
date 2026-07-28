/**
 * HIBP as a ProviderDefinition. All HIBP-specific logic (endpoints, headers,
 * status semantics, capability shape) stays in the pure adapter it wraps; this
 * file only adapts it to the shared provider framework.
 */

import { verifyKey, subscribedDomains, looksLikeHibpKey } from "@/lib/integrations/hibp";
import type { ProviderDefinition, ProviderValidation } from "./types";

async function validate(raw: string, signal?: AbortSignal): Promise<ProviderValidation> {
  // /subscription/status is the only true "connected" signal.
  const verification = await verifyKey(raw, signal);
  if (!verification.ok) {
    return { ok: false, code: verification.code, message: verification.message, status: verification.status, retryAfterSeconds: verification.retryAfterSeconds };
  }
  // Capability detection: domain search depends on HIBP-verified domains within the plan.
  const domains = await subscribedDomains(raw, signal);
  const verified = domains.ok ? domains.domains : [];
  return {
    ok: true,
    accountLabel: verification.subscription.subscriptionName,
    capabilities: [
      {
        id: "domain_search",
        label: "Domain breach search",
        available: verified.length > 0,
        detail: domains.ok
          ? verified.length > 0
            ? `${verified.length} HIBP-verified domain${verified.length === 1 ? "" : "s"}`
            : "No HIBP-verified domains yet — verify a domain in HIBP to enable it"
          : domains.message,
      },
    ],
  };
}

export const hibpProvider: ProviderDefinition = {
  id: "hibp",
  name: "Have I Been Pwned",
  category: "threat_intel",
  summary: "Breach exposure for domains you have verified. Bring your own HIBP API key — used server-side only.",
  credentialKind: "api_key",
  envKey: "HIBP_API_KEY",
  runLabel: "HaveIBeenPwned",
  docsUrl: "https://haveibeenpwned.com/API/Key",
  keyPlaceholder: "32-character key",
  looksValid: looksLikeHibpKey,
  formatHint: "A HIBP API key is 32 hexadecimal characters.",
  validate,
};
