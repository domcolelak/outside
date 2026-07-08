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
    attrs: { cdn: "Cloudflare", registrar: "public registrar" },
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
    attrs: { protocols: ["HTTPS"], technologies: ["Next.js", "Cloudflare"], status: "200", cdn: "Cloudflare" },
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
    attrs: { protocols: ["HTTPS"], technologies: ["nginx", "Next.js"], status: "200" },
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
      ev("http_observation", "HttpObservation", "Responds 200 over HTTPS.", "server: Apache/2.2.15; x-powered-by: PHP/5.6"),
    ],
    orgConfidence: 0.82,
    attrs: { protocols: ["HTTPS"], technologies: ["Apache/2.2.15", "PHP/5.6"], status: "200" },
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

  const assets = [root, cdn, www, api, mail, staging, vpn, legacy, testApi, saas];

  const edges: Edge[] = [
    edge(root, www, "subdomain_of", 1, [ev("dns", "DoH", "www is a subdomain of the root.")]),
    edge(root, api, "subdomain_of", 1, [ev("dns", "DoH", "api is a subdomain of the root.")]),
    edge(root, mail, "mail_for", 0.95, [ev("dns_mx", "DoH", "MX record for the root domain.")]),
    edge(root, staging, "subdomain_of", 1, [ev("certificate_transparency", "crt.sh", "Shares registrable domain.")]),
    edge(root, vpn, "subdomain_of", 1, [ev("dns", "DoH", "vpn is a subdomain of the root.")]),
    edge(root, legacy, "subdomain_of", 0.82, [ev("certificate_transparency", "crt.sh", "Shares registrable domain.")]),
    edge(root, testApi, "subdomain_of", 1, [ev("certificate_transparency", "crt.sh", "Shares registrable domain.")]),
    edge(root, saas, "depends_on", 0.85, [ev("dns", "DoH", "CNAME delegation to third-party SaaS.")]),
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

  return {
    slug: "northstar",
    name: "Northstar Labs",
    domain: D,
    assets,
    edges,
    timeline,
    linkedFromPrimary: ["www.northstarlabs.example", "api.northstarlabs.example"],
  };
}
