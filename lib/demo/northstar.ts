/**
 * Demo organization: Northstar Labs (northstarlabs.example).
 *
 * A carefully designed discovery storyline used for product demos and the
 * Attacker View. It exercises: normal infrastructure, a CDN-fronted primary
 * site, mail infrastructure with a mail-security signal, a possible staging
 * environment, an authentication surface, a possible shadow/legacy asset, a
 * newly-appeared test API, and a third-party SaaS dependency.
 *
 * All hostnames use the reserved .example TLD and are synthetic.
 */

import type { AttackerBeat, Asset, Edge } from "@/lib/types";
import type { ChangeSummary } from "@/lib/persistence/model";
import { asset, edge, ev, resetSeq } from "./factory";

export interface DemoOrg {
  slug: string;
  name: string;
  domain: string;
  assets: Asset[];
  edges: Edge[];
  timeline: AttackerBeat[];
  /** Hostnames the primary site links to (for shadow-asset context). */
  linkedFromPrimary: string[];
  /** Synthetic change story vs. a prior scan, for demonstrating change detection. */
  changeSummary?: ChangeSummary;
}

export function buildNorthstar(): DemoOrg {
  resetSeq();
  const D = "northstarlabs.example";

  const root = asset({
    kind: "root_domain",
    label: D,
    discoveredVia: ["seed"],
    evidence: [ev("seed", "OUTSIDE", "Root domain provided as the scan target.")],
    orgConfidence: 1,
    attrs: {
      cdn: "Cloudflare", registrar: "public registrar",
      // Domain-registration expiry (RDAP) — a takeover/outage risk on the root.
      domainDaysToExpiry: 12, domainExpiresAt: "2026-08-02",
      // HaveIBeenPwned breach exposure for the organization domain.
      breachCount: 2, breachSource: "HaveIBeenPwned", breachNames: ["Northstar Labs 2021", "DevForum 2019"], breachLatest: "2021-08-01",
      // VirusTotal aggregate vendor reputation for the domain.
      vtMalicious: 3, vtSuspicious: 1, vtHarmless: 58, vtReputation: -9, vtSource: "VirusTotal",
    },
  });

  const cdn = asset({
    kind: "cdn",
    label: "Cloudflare",
    canonical: "cloudflare",
    discoveredVia: ["http_observation", "dns"],
    evidence: [ev("http_observation", "HttpObservation", "Response headers and nameservers indicate Cloudflare fronting.")],
    orgConfidence: 0.6,
    attrs: { role: "cdn/waf" },
  });

  const www = asset({
    kind: "web_service",
    label: "www.northstarlabs.example",
    discoveredVia: ["certificate_transparency", "dns", "http_observation"],
    evidence: [
      ev("certificate_transparency", "crt.sh", "Hostname present on a public TLS certificate."),
      ev("http_observation", "HttpObservation", "Responds 200 over HTTPS; title 'Northstar Labs'.", "server: cloudflare"),
    ],
    attrs: {
      protocols: ["HTTPS"],
      technologies: ["Next.js", "Cloudflare"],
      status: "200",
      cdn: "Cloudflare",
      presentHeaders: ["X-Content-Type-Options", "Referrer-Policy"],
      missingHeaders: ["Strict-Transport-Security (HSTS)", "Content-Security-Policy", "X-Frame-Options"],
      certIssuer: "Let's Encrypt",
      certDaysToExpiry: 14,
      certFingerprint: "3c2d…a91f",
    },
  });

  const api = asset({
    kind: "api_surface",
    label: "api.northstarlabs.example",
    discoveredVia: ["certificate_transparency", "dns", "http_observation"],
    evidence: [
      ev("certificate_transparency", "crt.sh", "Hostname observed on a public certificate."),
      ev("http_observation", "HttpObservation", "Responds 401 over HTTPS; JSON error body.", "server: nginx"),
    ],
    attrs: { protocols: ["HTTPS"], technologies: ["nginx"], status: "401" },
  });

  const mail = asset({
    kind: "mail_service",
    label: "mail.northstarlabs.example",
    discoveredVia: ["dns_mx", "dns"],
    evidence: [
      ev("dns_mx", "DoH", "MX record designates this host as mail exchanger."),
      ev("dns_txt", "DoH", "No v=spf1 policy observed in domain TXT records."),
    ],
    orgConfidence: 0.9,
    attrs: { protocols: ["SMTP"], spf: "missing", dmarc: "missing", role: "mail exchanger" },
  });

  const staging = asset({
    kind: "web_service",
    label: "staging.northstarlabs.example",
    discoveredVia: ["certificate_transparency", "http_observation"],
    evidence: [
      ev("certificate_transparency", "crt.sh", "Hostname appeared on a public certificate."),
      ev("http_observation", "HttpObservation", "Responds 200 over HTTPS.", "server: nginx; x-powered-by: Next.js"),
    ],
    attrs: {
      protocols: ["HTTPS"], technologies: ["nginx", "Next.js"], status: "200",
      // Redirect that downgrades HTTPS to plain HTTP — transport protection lost.
      redirectLocation: "http://staging.northstarlabs.example/login",
    },
  });

  const vpn = asset({
    kind: "auth_surface",
    label: "vpn.northstarlabs.example",
    discoveredVia: ["dns", "http_observation"],
    evidence: [
      ev("dns", "DoH", "A record resolves publicly."),
      ev("http_observation", "HttpObservation", "Responds with a remote-access login page over HTTPS."),
    ],
    attrs: { protocols: ["HTTPS"], role: "remote access" },
  });

  const legacy = asset({
    kind: "web_service",
    label: "old-portal.northstarlabs.example",
    canonical: "old-portal.northstarlabs.example",
    discoveredVia: ["certificate_transparency", "http_observation"],
    evidence: [
      ev("certificate_transparency", "crt.sh", "Historical certificate lists this hostname; certificate still active."),
      ev("http_observation", "HttpObservation", "Responds 200 over HTTPS.", "server: Apache/2.2.15; OpenSSL/1.0.1e; x-powered-by: PHP/5.6"),
      ev("service_observation", "Censys", "Internet-wide scan observed additional non-web services on the resolved address."),
      ev("threat_intel", "AbuseIPDB", "The resolved address carries adverse reputation from recent abuse reports."),
    ],
    orgConfidence: 0.82,
    attrs: {
      protocols: ["HTTPS"], status: "200",
      // Dated stack: OpenSSL/1.0.1e correlates to Heartbleed (CVE-2014-0160, CISA KEV
      // + EPSS on a synced deployment); Apache 2.2 and PHP 5 are end-of-life branches.
      technologies: ["Apache/2.2.15", "PHP/5.6", "OpenSSL/1.0.1e"],
      // Censys observed sensitive non-web services exposed on the resolved address.
      exposedServices: ["22/TCP", "3306/TCP"], exposedServicesSource: "Censys",
      // GreyNoise classifies the resolved address as a malicious internet-wide scanner.
      greynoiseClass: "malicious", greynoiseIp: "45.9.148.60", greynoiseName: "Opportunistic scanner", greynoiseNoise: true, greynoiseLastSeen: "2026-07-19",
      // AbuseIPDB adverse reputation for the same address.
      threatIpScore: 88, threatIp: "45.9.148.60", threatIpSource: "AbuseIPDB", threatIpReports: 14, threatIpLastReported: "2026-07-18",
    },
  });

  const testApi = asset({
    kind: "api_surface",
    label: "test-api.northstarlabs.example",
    discoveredVia: ["certificate_transparency", "http_observation"],
    evidence: [
      ev("certificate_transparency", "crt.sh", "Newly issued certificate first seen 2026-07-05."),
      ev("http_observation", "HttpObservation", "Responds 200 over HTTPS; JSON.", "server: uvicorn; x-powered-by: FastAPI"),
    ],
    firstObservedAt: "2026-07-05T09:00:00.000Z",
    attrs: { protocols: ["HTTPS"], technologies: ["FastAPI", "uvicorn"], status: "200", newlyObserved: true },
  });

  const saas = asset({
    kind: "third_party",
    label: "status.northstarlabs.example",
    discoveredVia: ["dns"],
    evidence: [ev("dns", "DoH", "CNAME points to a third-party status-page provider.")],
    orgConfidence: 0.85,
    attrs: { provider: "Statuspage (third-party)", role: "status page" },
  });

  const passive = asset({
    kind: "web_service",
    label: "internal-tools.northstarlabs.example",
    discoveredVia: ["passive_subdomain", "dns"],
    evidence: [
      ev("passive_subdomain", "SecurityTrails", "Hostname reported by a commercial passive-DNS dataset; it never appeared on any public certificate."),
      ev("dns", "DoH", "A record resolves publicly."),
      ev("http_observation", "HttpObservation", "Responds 200 over HTTPS; an internal tooling login.", "server: nginx"),
    ],
    orgConfidence: 0.8,
    attrs: { protocols: ["HTTPS"], technologies: ["nginx"], role: "internal tooling", status: "200" },
  });

  const assets = [root, cdn, www, api, mail, staging, vpn, legacy, testApi, saas, passive];

  const edges: Edge[] = [
    edge(root, www, "subdomain_of", 1, [ev("dns", "DoH", "www is a subdomain of the root.")]),
    edge(root, api, "subdomain_of", 1, [ev("dns", "DoH", "api is a subdomain of the root.")]),
    edge(root, mail, "mail_for", 0.95, [ev("dns_mx", "DoH", "MX record for the root domain.")]),
    edge(root, staging, "subdomain_of", 1, [ev("certificate_transparency", "crt.sh", "Shares registrable domain.")]),
    edge(root, vpn, "subdomain_of", 1, [ev("dns", "DoH", "vpn is a subdomain of the root.")]),
    edge(root, legacy, "subdomain_of", 0.82, [ev("certificate_transparency", "crt.sh", "Shares registrable domain.")]),
    edge(root, testApi, "subdomain_of", 1, [ev("certificate_transparency", "crt.sh", "Shares registrable domain.")]),
    edge(root, saas, "depends_on", 0.85, [ev("dns", "DoH", "CNAME delegation to third-party SaaS.")]),
    edge(root, passive, "subdomain_of", 0.9, [ev("passive_subdomain", "SecurityTrails", "Shares the registrable domain; surfaced from passive-DNS telemetry.")]),
    edge(www, cdn, "fronted_by", 0.7, [ev("http_observation", "HttpObservation", "Edge server headers indicate CDN.")]),
    edge(root, cdn, "fronted_by", 0.7, [ev("dns", "DoH", "Nameservers indicate CDN provider.")]),
  ];

  const timeline: AttackerBeat[] = [
    { t: 1, headline: "Root domain identified", detail: "northstarlabs.example", revealAssetIds: [root.id], revealEdgeIds: [] },
    {
      t: 4,
      headline: "Public certificate evidence reveals additional hostnames",
      detail: "www, api and staging appear on public TLS certificates.",
      revealAssetIds: [www.id, api.id, staging.id],
      revealEdgeIds: [
        `e_${root.id}_${www.id}_subdomain_of`,
        `e_${root.id}_${api.id}_subdomain_of`,
        `e_${root.id}_${staging.id}_subdomain_of`,
      ],
      emphasis: "signal",
    },
    {
      t: 8,
      headline: "Public DNS relationships reveal mail infrastructure",
      detail: "MX records designate a public mail exchanger; no SPF policy observed.",
      revealAssetIds: [mail.id],
      revealEdgeIds: [`e_${root.id}_${mail.id}_mail_for`],
    },
    {
      t: 10,
      headline: "Passive-DNS telemetry reveals a host with no certificate history",
      detail: "internal-tools.northstarlabs.example surfaced from commercial passive-DNS data — it never appeared on any public certificate.",
      revealAssetIds: [passive.id],
      revealEdgeIds: [`e_${root.id}_${passive.id}_subdomain_of`],
      emphasis: "shadow",
    },
    {
      t: 12,
      headline: "staging.northstarlabs.example responds publicly over HTTPS",
      detail: "Naming and response indicate a possible non-production environment.",
      revealAssetIds: [],
      revealEdgeIds: [],
      emphasis: "signal",
    },
    {
      t: 15,
      headline: "A remote-access surface is identified",
      detail: "vpn.northstarlabs.example serves a login page.",
      revealAssetIds: [vpn.id],
      revealEdgeIds: [`e_${root.id}_${vpn.id}_subdomain_of`],
    },
    {
      t: 18,
      headline: "A potentially unmanaged historical hostname is identified",
      detail: "old-portal.northstarlabs.example runs dated technology and is not linked from the primary site.",
      revealAssetIds: [legacy.id],
      revealEdgeIds: [`e_${root.id}_${legacy.id}_subdomain_of`],
      emphasis: "shadow",
    },
    {
      t: 21,
      headline: "A newly-issued certificate reveals a new API asset",
      detail: "test-api.northstarlabs.example first appeared two days ago.",
      revealAssetIds: [testApi.id, cdn.id, saas.id],
      revealEdgeIds: [
        `e_${root.id}_${testApi.id}_subdomain_of`,
        `e_${www.id}_${cdn.id}_fronted_by`,
        `e_${root.id}_${cdn.id}_fronted_by`,
        `e_${root.id}_${saas.id}_depends_on`,
      ],
      emphasis: "signal",
    },
  ];

  const changeSummary: ChangeSummary = {
    previousScanId: "demo_prev",
    events: [
      {
        type: "asset_appeared",
        canonical: "test-api.northstarlabs.example",
        label: "test-api.northstarlabs.example",
        detail: "A new public API asset appeared, first observed two days ago.",
        priority: "high",
      },
      {
        type: "asset_returned",
        canonical: "old-portal.northstarlabs.example",
        label: "old-portal.northstarlabs.example",
        detail: "A previously absent legacy hostname is publicly reachable again.",
        priority: "high",
      },
      {
        type: "technology_changed",
        canonical: "api.northstarlabs.example",
        label: "api.northstarlabs.example",
        detail: "Observed technology signals changed since the previous scan.",
        priority: "medium",
        from: "nginx",
        to: "nginx, Cloudflare",
      },
      {
        type: "certificate_changed",
        canonical: "www.northstarlabs.example",
        label: "www.northstarlabs.example",
        detail: "The certificate presented for this hostname changed since the previous scan.",
        priority: "medium",
        from: "Let's Encrypt (…a91f)",
        to: "Let's Encrypt (…3c2d)",
      },
    ],
    counts: { appeared: 1, returned: 1, disappeared: 0, changed: 2 },
  };

  return {
    slug: "northstar",
    name: "Northstar Labs",
    domain: D,
    assets,
    edges,
    timeline,
    linkedFromPrimary: ["www.northstarlabs.example", "api.northstarlabs.example"],
    changeSummary,
  };
}
