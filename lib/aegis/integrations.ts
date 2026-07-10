/**
 * Safe integrations registry.
 *
 * Integrations are never required — OUTSIDE + Aegis are fully useful with none
 * connected. When a provider is connected it lets Aegis (a) enrich observations
 * and (b) *apply* the remediations it already recommends — always previewable,
 * approved, audited, and rollback-capable. Connection state is env-gated here;
 * live OAuth/token flows are the documented next step per provider.
 *
 * Each connector declares which recommendation categories it can help remediate,
 * so the integrations surface reads as "connect this to act on what Aegis found"
 * rather than a bag of unrelated logos.
 */

import type { RecommendationCategory } from "./types";

export type IntegrationCategory = "edge_cdn" | "cloud" | "identity" | "source" | "hosting" | "dns";

export interface Connector {
  id: string;
  name: string;
  category: IntegrationCategory;
  /** What connecting unlocks, in plain language. */
  summary: string;
  /** Recommendation categories this connector can help apply. */
  remediates: RecommendationCategory[];
  /** Env var whose presence marks the connector as configured. */
  envKey: string;
}

export const CONNECTORS: Connector[] = [
  {
    id: "cloudflare",
    name: "Cloudflare",
    category: "edge_cdn",
    summary: "Apply security headers, WAF/access policies for non-production and auth surfaces, and manage DNS + mail records.",
    remediates: ["security_headers", "non_production_exposure", "auth_surface", "mail_security", "certificate_lifecycle"],
    envKey: "CLOUDFLARE_API_TOKEN",
  },
  {
    id: "fastly",
    name: "Fastly",
    category: "edge_cdn",
    summary: "Manage edge security headers and TLS certificate lifecycle at the CDN.",
    remediates: ["security_headers", "certificate_lifecycle"],
    envKey: "FASTLY_API_TOKEN",
  },
  {
    id: "aws",
    name: "AWS",
    category: "cloud",
    summary: "Correlate Route 53 DNS, ACM certificates, and CloudFront headers; surface publicly-exposed resources.",
    remediates: ["certificate_lifecycle", "security_headers", "mail_security"],
    envKey: "AWS_ACCESS_KEY_ID",
  },
  {
    id: "azure",
    name: "Azure",
    category: "cloud",
    summary: "Correlate Azure DNS, App Service headers, and certificate lifecycle.",
    remediates: ["certificate_lifecycle", "security_headers"],
    envKey: "AZURE_CLIENT_ID",
  },
  {
    id: "gcp",
    name: "Google Cloud",
    category: "cloud",
    summary: "Correlate Cloud DNS, managed certificates, and load-balancer security policies.",
    remediates: ["certificate_lifecycle", "security_headers"],
    envKey: "GOOGLE_APPLICATION_CREDENTIALS",
  },
  {
    id: "m365",
    name: "Microsoft 365",
    category: "identity",
    summary: "Deepen mail-security guidance (SPF/DKIM/DMARC) and review externally-reachable authentication surfaces.",
    remediates: ["mail_security", "auth_surface"],
    envKey: "M365_CLIENT_ID",
  },
  {
    id: "google_workspace",
    name: "Google Workspace",
    category: "identity",
    summary: "Verify and strengthen mail authentication and review sign-in surfaces.",
    remediates: ["mail_security", "auth_surface"],
    envKey: "GOOGLE_WORKSPACE_CLIENT_ID",
  },
  {
    id: "github",
    name: "GitHub",
    category: "source",
    summary: "Monitor website integrity and catch exposed secrets or infrastructure-as-code drift feeding shadow assets.",
    remediates: ["shadow_asset", "surface_change"],
    envKey: "GITHUB_APP_TOKEN",
  },
  {
    id: "vercel",
    name: "Vercel",
    category: "hosting",
    summary: "Apply security headers and manage domains/certificates for hosted projects.",
    remediates: ["security_headers", "certificate_lifecycle", "surface_change"],
    envKey: "VERCEL_API_TOKEN",
  },
  {
    id: "netlify",
    name: "Netlify",
    category: "hosting",
    summary: "Apply security headers and manage domains/certificates for hosted sites.",
    remediates: ["security_headers", "certificate_lifecycle"],
    envKey: "NETLIFY_API_TOKEN",
  },
  {
    id: "digitalocean",
    name: "DigitalOcean",
    category: "cloud",
    summary: "Correlate DNS and detect publicly-exposed droplets/services extending the surface.",
    remediates: ["surface_change", "non_production_exposure"],
    envKey: "DIGITALOCEAN_TOKEN",
  },
];

export const INTEGRATION_CATEGORY_LABEL: Record<IntegrationCategory, string> = {
  edge_cdn: "Edge & CDN",
  cloud: "Cloud",
  identity: "Identity & Mail",
  source: "Source & CI",
  hosting: "Hosting",
  dns: "DNS",
};

export interface ConnectorState extends Connector {
  connected: boolean;
}

/** Connector list with live (env-gated) connection state. Never throws. */
export function connectorStates(): ConnectorState[] {
  return CONNECTORS.map((c) => ({ ...c, connected: !!process.env[c.envKey] }));
}
