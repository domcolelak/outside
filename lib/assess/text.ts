/**
 * Catalog keys for the assessment checks.
 *
 * A check's id is stable and versioned — it is what a customer's retest diff is
 * keyed on — so the wording is looked up from the id rather than stored beside
 * it. That keeps `checks.ts` a catalogue of *what is evaluated*, and leaves
 * *how it is worded* to messages/<locale>/assess.json.
 *
 * The mapping is explicit rather than derived from the id by string munging.
 * A derived key silently produces a missing message the moment someone adds a
 * check whose id does not transliterate the way the last one did; an explicit
 * record fails the message check instead, before it ships.
 */

import type { MessageKey } from "@/lib/i18n/messages";

const CHECK_KEY_STEM: Record<string, string> = {
  "tls-certificate": "tlsCertificate",
  "http-security-headers": "httpSecurityHeaders",
  "transport-downgrade": "transportDowngrade",
  "mail-authentication": "mailAuthentication",
  "known-vulnerability-correlation": "knownVulnerabilityCorrelation",
  "exposed-services": "exposedServices",
  "authentication-surface": "authenticationSurface",
  "non-production-exposure": "nonProductionExposure",
  "shadow-assets": "shadowAssets",
  "infrastructure-concentration": "infrastructureConcentration",
  "domain-registration": "domainRegistration",
};

/** The catalog key for one field of a check's wording. */
export function checkTextKey(
  checkId: string,
  field: "Title" | "Rationale" | "Remediation",
): MessageKey<"assess"> {
  const stem = CHECK_KEY_STEM[checkId];
  // An unmapped id would render as the key itself, which is worse than English.
  // The test in checks.test.ts asserts the map covers the catalogue, so this
  // path only exists for a check added without its wording.
  return (stem ? `${stem}${field}` : `unmapped${field}`) as MessageKey<"assess">;
}

/** Every check id the catalog has wording for. Used by the coverage test. */
export const MAPPED_CHECK_IDS = Object.keys(CHECK_KEY_STEM);
