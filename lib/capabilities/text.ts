/**
 * Catalog keys for the capability registry.
 *
 * A capability id (CAP-DISCOVERY-CT) is a stable, quotable identifier — it
 * appears in the registry test that fails when a capability drifts from what a
 * real scan produces — so the wording is looked up from the id rather than
 * translated where the capability is declared.
 *
 * The map is written out rather than derived from the id, for the same reason
 * as the assessment checks: a derived key silently produces a missing message
 * the first time an id does not transliterate the way the last one did.
 */

import type { MessageKey } from "@/lib/i18n/messages";

const CAPABILITY_KEY_STEM: Record<string, string> = {
  "CAP-DISCOVERY-CT": "discoveryCt",
  "CAP-DISCOVERY-DNS": "discoveryDns",
  "CAP-DISCOVERY-HTTP": "discoveryHttp",
  "CAP-DISCOVERY-RDAP": "discoveryRdap",
  "CAP-PASSIVEDNS-SECURITYTRAILS": "passivednsSecuritytrails",
  "CAP-PASSIVEDNS-SHODAN": "passivednsShodan",
  "CAP-CENSYS-SERVICES": "censysServices",
  "CAP-CLASSIFY-SIGNALS": "classifySignals",
  "CAP-MAIL-SECURITY": "mailSecurity",
  "CAP-MISCONFIG-HEADERS": "misconfigHeaders",
  "CAP-MISCONFIG-REDIRECT": "misconfigRedirect",
  "CAP-MISCONFIG-CERT": "misconfigCert",
  "CAP-MISCONFIG-DOMAIN": "misconfigDomain",
  "CAP-VULN-CORRELATION": "vulnCorrelation",
  "CAP-INTEL-IPREP": "intelIprep",
  "CAP-INTEL-BREACH": "intelBreach",
  "CAP-INTEL-GREYNOISE": "intelGreynoise",
  "CAP-INTEL-VIRUSTOTAL": "intelVirustotal",
  "CAP-TWIN-CONCENTRATION": "twinConcentration",
  "CAP-GUARDIAN-CHANGE": "guardianChange",
};

/** The catalog key for a capability's name or description, or null if unmapped. */
export function capabilityTextKey(
  capabilityId: string,
  field: "Name" | "Description",
): MessageKey<"capabilities"> | null {
  const stem = CAPABILITY_KEY_STEM[capabilityId];
  return stem ? (`${stem}${field}` as MessageKey<"capabilities">) : null;
}

/** The finding categories a capability can claim, as catalog keys. */
export const CATEGORY_KEY: Record<string, MessageKey<"capabilities">> = {
  "security-headers": "catSecurityHeaders",
  "insecure-redirect": "catInsecureRedirect",
  "certificate-expiry": "catCertificateExpiry",
  "domain-expiry": "catDomainExpiry",
  "known-vulnerability": "catKnownVulnerability",
  "exposed-service": "catExposedService",
  "threat-intelligence": "catThreatIntelligence",
  "breach-exposure": "catBreachExposure",
  "mail-security": "catMailSecurity",
  "shadow-asset": "catShadowAsset",
  "non-production-exposure": "catNonProduction",
  "auth-surface": "catAuthSurface",
  "surface-change": "catSurfaceChange",
  "infrastructure-concentration": "catConcentration",
};

/** Every capability id the catalog has wording for. Used by the coverage test. */
export const MAPPED_CAPABILITY_IDS = Object.keys(CAPABILITY_KEY_STEM);
