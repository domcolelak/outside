/**
 * Capability Registry — OUTSIDE's machine-readable self-awareness layer.
 *
 * A single, authoritative inventory of what the platform can actually do:
 * every discovery collector, enrichment provider, and detector that ships in
 * the deterministic pipeline. This is deliberately grounded in real code — the
 * accompanying test (`registry.test.ts`) asserts that the finding categories a
 * scan actually produces are all covered here and that every capability's
 * declared category is real, so the registry can never drift into fiction.
 *
 * It answers, for any consumer (UI, gap analysis, reports, an operator's
 * procurement review): "what does OUTSIDE detect, how, from what evidence, is it
 * passive, and does it need an operator key?"
 */

import type { DiscoveryMethod } from "@/lib/types";

export type CapabilityType =
  | "discovery_collector"
  | "enrichment_collector"
  | "passive_detector"
  | "correlation";

export interface Capability {
  /** Stable identifier. */
  id: string;
  name: string;
  description: string;
  type: CapabilityType;
  status: "production";
  /** Finding categories this capability can produce (empty for pure collectors). */
  detects: string[];
  /** Inputs it consumes. */
  inputs: string[];
  /** The discovery method its evidence is attributed to. */
  evidenceMethod: DiscoveryMethod;
  /** Passive (no impact on the target) vs. active (bounded, verified-target only). */
  passive: boolean;
  /** Operator env var required to activate, or null when always on. */
  requiresProviderKey: string | null;
  /** Source module. */
  source: string;
}

export const CAPABILITIES: readonly Capability[] = [
  // ---- Discovery collectors ----
  {
    id: "CAP-DISCOVERY-CT", name: "Certificate Transparency discovery", type: "discovery_collector", status: "production",
    description: "Enumerates hostnames from public TLS certificate logs (crt.sh).",
    detects: [], inputs: ["registrable_domain"], evidenceMethod: "certificate_transparency", passive: true, requiresProviderKey: null,
    source: "lib/discovery/providers.ts",
  },
  {
    id: "CAP-DISCOVERY-DNS", name: "DNS-over-HTTPS resolution", type: "discovery_collector", status: "production",
    description: "Resolves candidate hostnames and infrastructure records over DoH (Cloudflare).",
    detects: [], inputs: ["hostname"], evidenceMethod: "dns", passive: true, requiresProviderKey: null,
    source: "lib/discovery/providers.ts",
  },
  {
    id: "CAP-DISCOVERY-HTTP", name: "SSRF-pinned HTTPS/TLS observation", type: "discovery_collector", status: "production",
    description: "Observes response headers, redirects and certificate metadata over an IP-pinned, DNS-rebinding-safe TLS connection. Verified targets only.",
    detects: [], inputs: ["hostname", "resolved_ip"], evidenceMethod: "http_observation", passive: false, requiresProviderKey: null,
    source: "lib/discovery/http.ts",
  },
  {
    id: "CAP-DISCOVERY-RDAP", name: "Domain-registration lookup", type: "discovery_collector", status: "production",
    description: "Reads registrar and expiry from RDAP for the root domain.",
    detects: [], inputs: ["registrable_domain"], evidenceMethod: "domain_registration", passive: true, requiresProviderKey: null,
    source: "lib/discovery/providers.ts",
  },
  {
    id: "CAP-PASSIVEDNS-SECURITYTRAILS", name: "Passive-DNS expansion (SecurityTrails)", type: "discovery_collector", status: "production",
    description: "Adds subdomains from SecurityTrails that never appeared on a public certificate; every hostname is validated as a real subdomain of the target.",
    detects: [], inputs: ["registrable_domain"], evidenceMethod: "passive_subdomain", passive: true, requiresProviderKey: "SECURITYTRAILS_API_KEY",
    source: "lib/discovery/passive-dns.ts",
  },
  {
    id: "CAP-PASSIVEDNS-SHODAN", name: "Passive-DNS expansion (Shodan)", type: "discovery_collector", status: "production",
    description: "Adds subdomains from Shodan's DNS dataset, validated as real subdomains of the target.",
    detects: [], inputs: ["registrable_domain"], evidenceMethod: "passive_subdomain", passive: true, requiresProviderKey: "SHODAN_API_KEY",
    source: "lib/discovery/passive-dns.ts",
  },
  {
    id: "CAP-CENSYS-SERVICES", name: "Censys service discovery", type: "enrichment_collector", status: "production",
    description: "Reports non-web services (SSH, databases, RDP, brokers) observed on resolved public IPs, and flags exposed datastores/admin surfaces.",
    detects: ["exposed-service"], inputs: ["resolved_ip"], evidenceMethod: "service_observation", passive: true, requiresProviderKey: "CENSYS_API_ID",
    source: "lib/discovery/censys.ts",
  },

  // ---- Deterministic detectors ----
  {
    id: "CAP-CLASSIFY-SIGNALS", name: "Asset classification & exposure signals", type: "passive_detector", status: "production",
    description: "Classifies assets (web, API, auth, mail) and derives shadow-asset, non-production and auth-surface exposure signals.",
    detects: ["shadow-asset", "non-production-exposure", "auth-surface"], inputs: ["asset_graph"], evidenceMethod: "dns", passive: true, requiresProviderKey: null,
    source: "lib/analysis/signals.ts",
  },
  {
    id: "CAP-MAIL-SECURITY", name: "Mail-security posture", type: "passive_detector", status: "production",
    description: "Detects missing SPF/DMARC policy on the mail surface.",
    detects: ["mail-security"], inputs: ["dns_txt", "dns_mx"], evidenceMethod: "dns_txt", passive: true, requiresProviderKey: null,
    source: "lib/analysis/findings.ts",
  },
  {
    id: "CAP-MISCONFIG-HEADERS", name: "Missing security-header detection", type: "passive_detector", status: "production",
    description: "Flags absent baseline HTTP security headers from the observed response.",
    detects: ["security-headers"], inputs: ["http_headers"], evidenceMethod: "http_observation", passive: false, requiresProviderKey: null,
    source: "lib/analysis/misconfig.ts",
  },
  {
    id: "CAP-MISCONFIG-REDIRECT", name: "HTTPS→HTTP downgrade detection", type: "passive_detector", status: "production",
    description: "Flags a redirect that downgrades HTTPS to plain HTTP.",
    detects: ["insecure-redirect"], inputs: ["http_headers"], evidenceMethod: "http_observation", passive: false, requiresProviderKey: null,
    source: "lib/analysis/misconfig.ts",
  },
  {
    id: "CAP-MISCONFIG-CERT", name: "Certificate expiry grading", type: "passive_detector", status: "production",
    description: "Grades TLS certificate expiry (expired / ≤7 / ≤14 / ≤30 days).",
    detects: ["certificate-expiry"], inputs: ["tls_certificate"], evidenceMethod: "http_observation", passive: false, requiresProviderKey: null,
    source: "lib/analysis/misconfig.ts",
  },
  {
    id: "CAP-MISCONFIG-DOMAIN", name: "Domain-registration expiry", type: "passive_detector", status: "production",
    description: "Flags an expiring or lapsed root-domain registration (takeover/outage risk).",
    detects: ["domain-expiry"], inputs: ["rdap"], evidenceMethod: "domain_registration", passive: true, requiresProviderKey: null,
    source: "lib/analysis/misconfig.ts",
  },
  {
    id: "CAP-VULN-CORRELATION", name: "Known-vulnerability correlation (KEV + EPSS)", type: "correlation", status: "production",
    description: "Correlates disclosed technology versions against a curated CVE/EOL set, enriched with live CISA KEV status and FIRST.org EPSS scores.",
    detects: ["known-vulnerability"], inputs: ["technology_banner"], evidenceMethod: "technology_fingerprint", passive: true, requiresProviderKey: null,
    source: "lib/analysis/vulnerabilities.ts",
  },

  // ---- Threat-intelligence enrichment (operator-keyed) ----
  {
    id: "CAP-INTEL-IPREP", name: "IP reputation (AbuseIPDB)", type: "enrichment_collector", status: "production",
    description: "Attaches adverse reputation for resolved public IPs.",
    detects: ["threat-intelligence"], inputs: ["resolved_ip"], evidenceMethod: "threat_intel", passive: true, requiresProviderKey: "ABUSEIPDB_API_KEY",
    source: "lib/intel/providers.ts",
  },
  {
    id: "CAP-INTEL-BREACH", name: "Breach exposure (HaveIBeenPwned)", type: "enrichment_collector", status: "production",
    description: "Reports public data breaches associated with the organization domain.",
    detects: ["breach-exposure"], inputs: ["registrable_domain"], evidenceMethod: "threat_intel", passive: true, requiresProviderKey: "HIBP_API_KEY",
    source: "lib/intel/providers.ts",
  },
  {
    id: "CAP-INTEL-GREYNOISE", name: "IP classification (GreyNoise)", type: "enrichment_collector", status: "production",
    description: "Classifies resolved IPs as malicious internet-wide scanners vs benign.",
    detects: ["threat-intelligence"], inputs: ["resolved_ip"], evidenceMethod: "threat_intel", passive: true, requiresProviderKey: "GREYNOISE_API_KEY",
    source: "lib/intel/providers.ts",
  },
  {
    id: "CAP-INTEL-VIRUSTOTAL", name: "Domain reputation (VirusTotal)", type: "enrichment_collector", status: "production",
    description: "Aggregates security-vendor reputation verdicts for the domain.",
    detects: ["threat-intelligence"], inputs: ["registrable_domain"], evidenceMethod: "threat_intel", passive: true, requiresProviderKey: "VIRUSTOTAL_API_KEY",
    source: "lib/intel/providers.ts",
  },

  // ---- Topology / Digital Twin ----
  {
    id: "CAP-TWIN-CONCENTRATION", name: "Concentration-risk / single-point-of-failure detection", type: "correlation", status: "production",
    description: "Builds the Digital Twin dependency graph and flags shared nodes (CDN, nameserver, IP, technology) that a large share of the surface depends on.",
    detects: ["infrastructure-concentration"], inputs: ["asset_graph", "edges"], evidenceMethod: "dns", passive: true, requiresProviderKey: null,
    source: "lib/twin/twin.ts",
  },

  // ---- Continuous monitoring ----
  {
    id: "CAP-GUARDIAN-CHANGE", name: "Guardian change intelligence", type: "passive_detector", status: "production",
    description: "Detects new, returning, disappearing, drifting and priority-changed surface between scans.",
    detects: ["surface-change"], inputs: ["scan_history"], evidenceMethod: "seed", passive: true, requiresProviderKey: null,
    source: "lib/guardian",
  },
] as const;

/** Every finding category the registry claims coverage for. */
export function coveredCategories(): Set<string> {
  return new Set(CAPABILITIES.flatMap((c) => c.detects));
}

/** Capabilities active without any operator key (the always-on baseline). */
export function baselineCapabilities(): Capability[] {
  return CAPABILITIES.filter((c) => c.requiresProviderKey === null);
}

/** Lookup by id. */
export function capability(id: string): Capability | undefined {
  return CAPABILITIES.find((c) => c.id === id);
}
