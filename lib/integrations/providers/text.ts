/**
 * Catalog keys for provider descriptions.
 *
 * A provider's id is stable — it keys the stored credential, the audit trail and
 * the telemetry — so the description is looked up from the id rather than being
 * translated where the provider is defined. That keeps each adapter a statement
 * of what the provider does, and leaves how it is worded to
 * messages/<locale>/integrations.json.
 *
 * Provider names are not here. AbuseIPDB, GreyNoise and Have I Been Pwned are
 * the names of other companies' products; translating them would send a customer
 * looking for a key on a site that does not exist.
 */

import type { MessageKey } from "@/lib/i18n/messages";

/**
 * Every provider whose description the catalog carries. Listed rather than
 * derived from the id, so a provider added without wording fails the test in
 * text.test.ts instead of rendering its key on the integrations page.
 */
export const DESCRIBED_PROVIDER_IDS = [
  "abuseipdb",
  "aws",
  "azure",
  "censys",
  "digitalocean",
  "fastly",
  "gcp",
  "github",
  "google_workspace",
  "greynoise",
  "hibp",
  "m365",
  "netlify",
  "openai",
  "securitytrails",
  "shodan",
  "vercel",
  "virustotal",
] as const;

const DESCRIBED = new Set<string>(DESCRIBED_PROVIDER_IDS);

/**
 * The catalog key for a provider's description, or null when the catalog has no
 * wording for it. Null means "render the English the adapter already carries" —
 * the same fallback findings use, and the reason a new provider ships readable
 * rather than showing a key.
 */
export function providerSummaryKey(providerId: string): MessageKey<"integrations"> | null {
  return DESCRIBED.has(providerId)
    ? (`${providerId}Summary` as MessageKey<"integrations">)
    : null;
}
