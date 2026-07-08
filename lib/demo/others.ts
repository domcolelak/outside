/**
 * Two additional synthetic demo organizations with distinct shapes so demos can
 * show varied external surfaces. Both use reserved TLDs and synthetic hosts.
 */

import type { AttackerBeat, Edge } from "@/lib/types";
import { asset, edge, ev, resetSeq } from "./factory";
import type { DemoOrg } from "./northstar";

export function buildVelora(): DemoOrg {
  resetSeq();
  const D = "veloracommerce.example";
  const root = asset({ kind: "root_domain", label: D, discoveredVia: ["seed"], evidence: [ev("seed", "OUTSIDE", "Scan target.")], orgConfidence: 1, attrs: { cdn: "Fastly" } });
  const shop = asset({ kind: "web_service", label: `shop.${D}`, discoveredVia: ["certificate_transparency", "http_observation"], evidence: [ev("http_observation", "HttpObservation", "Storefront responds 200 over HTTPS.")], attrs: { protocols: ["HTTPS"], technologies: ["Shopify"], cdn: "Fastly" } });
  const checkout = asset({ kind: "api_surface", label: `checkout-api.${D}`, discoveredVia: ["certificate_transparency"], evidence: [ev("certificate_transparency", "crt.sh", "On public certificate.")], attrs: { protocols: ["HTTPS"], technologies: ["nginx"] } });
  const admin = asset({ kind: "auth_surface", label: `admin.${D}`, discoveredVia: ["dns", "http_observation"], evidence: [ev("http_observation", "HttpObservation", "Admin login page over HTTPS.")], attrs: { protocols: ["HTTPS"], role: "administration" } });
  const dev = asset({ kind: "web_service", label: `dev.${D}`, discoveredVia: ["certificate_transparency"], evidence: [ev("certificate_transparency", "crt.sh", "On public certificate; naming indicates development.")], attrs: { protocols: ["HTTPS"], technologies: ["nginx"] } });
  const mail = asset({ kind: "mail_service", label: `mail.${D}`, discoveredVia: ["dns_mx"], evidence: [ev("dns_mx", "DoH", "MX record."), ev("dns_txt", "DoH", "SPF policy present.")], attrs: { protocols: ["SMTP"], spf: "present" } });
  const assets = [root, shop, checkout, admin, dev, mail];
  const edges: Edge[] = [
    edge(root, shop, "subdomain_of", 1, [ev("dns", "DoH", "subdomain")]),
    edge(root, checkout, "subdomain_of", 1, [ev("certificate_transparency", "crt.sh", "shares domain")]),
    edge(root, admin, "subdomain_of", 1, [ev("dns", "DoH", "subdomain")]),
    edge(root, dev, "subdomain_of", 1, [ev("certificate_transparency", "crt.sh", "shares domain")]),
    edge(root, mail, "mail_for", 0.95, [ev("dns_mx", "DoH", "MX")]),
  ];
  const timeline: AttackerBeat[] = [
    { t: 1, headline: "Root domain identified", detail: D, revealAssetIds: [root.id], revealEdgeIds: [] },
    { t: 5, headline: "Storefront and checkout API revealed by certificates", detail: `shop.${D}, checkout-api.${D}`, revealAssetIds: [shop.id, checkout.id], revealEdgeIds: [`e_${root.id}_${shop.id}_subdomain_of`, `e_${root.id}_${checkout.id}_subdomain_of`], emphasis: "signal" },
    { t: 9, headline: "Administration surface identified", detail: `admin.${D}`, revealAssetIds: [admin.id], revealEdgeIds: [`e_${root.id}_${admin.id}_subdomain_of`] },
    { t: 13, headline: "Possible development environment reachable", detail: `dev.${D}`, revealAssetIds: [dev.id], revealEdgeIds: [`e_${root.id}_${dev.id}_subdomain_of`], emphasis: "signal" },
    { t: 16, headline: "Mail infrastructure mapped", detail: `mail.${D}`, revealAssetIds: [mail.id], revealEdgeIds: [`e_${root.id}_${mail.id}_mail_for`] },
  ];
  return { slug: "velora", name: "Velora Commerce", domain: D, assets, edges, timeline, linkedFromPrimary: [`shop.${D}`] };
}

export function buildAtlas(): DemoOrg {
  resetSeq();
  const D = "atlasfinancial.example";
  const root = asset({ kind: "root_domain", label: D, discoveredVia: ["seed"], evidence: [ev("seed", "OUTSIDE", "Scan target.")], orgConfidence: 1, attrs: { cdn: "Akamai" } });
  const www = asset({ kind: "web_service", label: `www.${D}`, discoveredVia: ["certificate_transparency", "http_observation"], evidence: [ev("http_observation", "HttpObservation", "Corporate site 200 over HTTPS.")], attrs: { protocols: ["HTTPS"], technologies: ["Akamai"], cdn: "Akamai" } });
  const portal = asset({ kind: "auth_surface", label: `portal.${D}`, discoveredVia: ["dns", "http_observation"], evidence: [ev("http_observation", "HttpObservation", "Client login portal over HTTPS.")], attrs: { protocols: ["HTTPS"], role: "client portal" } });
  const sso = asset({ kind: "auth_surface", label: `sso.${D}`, discoveredVia: ["certificate_transparency"], evidence: [ev("certificate_transparency", "crt.sh", "On public certificate.")], attrs: { protocols: ["HTTPS"], role: "single sign-on" } });
  const uat = asset({ kind: "web_service", label: `uat.${D}`, discoveredVia: ["certificate_transparency"], evidence: [ev("certificate_transparency", "crt.sh", "On public certificate; UAT naming.")], firstObservedAt: "2026-07-06T00:00:00.000Z", attrs: { protocols: ["HTTPS"], technologies: ["IIS/8.5"], newlyObserved: true } });
  const mail = asset({ kind: "mail_service", label: `mail.${D}`, discoveredVia: ["dns_mx"], evidence: [ev("dns_mx", "DoH", "MX record."), ev("dns_txt", "DoH", "SPF present, DMARC p=none.")], attrs: { protocols: ["SMTP"], spf: "present", dmarc: "none" } });
  const assets = [root, www, portal, sso, uat, mail];
  const edges: Edge[] = [
    edge(root, www, "subdomain_of", 1, [ev("dns", "DoH", "subdomain")]),
    edge(root, portal, "subdomain_of", 1, [ev("dns", "DoH", "subdomain")]),
    edge(root, sso, "subdomain_of", 1, [ev("certificate_transparency", "crt.sh", "shares domain")]),
    edge(root, uat, "subdomain_of", 1, [ev("certificate_transparency", "crt.sh", "shares domain")]),
    edge(root, mail, "mail_for", 0.95, [ev("dns_mx", "DoH", "MX")]),
  ];
  const timeline: AttackerBeat[] = [
    { t: 1, headline: "Root domain identified", detail: D, revealAssetIds: [root.id], revealEdgeIds: [] },
    { t: 5, headline: "Corporate site and SSO revealed", detail: `www.${D}, sso.${D}`, revealAssetIds: [www.id, sso.id], revealEdgeIds: [`e_${root.id}_${www.id}_subdomain_of`, `e_${root.id}_${sso.id}_subdomain_of`], emphasis: "signal" },
    { t: 9, headline: "Client login portal identified", detail: `portal.${D}`, revealAssetIds: [portal.id], revealEdgeIds: [`e_${root.id}_${portal.id}_subdomain_of`] },
    { t: 13, headline: "New UAT environment appeared", detail: `uat.${D} first observed yesterday`, revealAssetIds: [uat.id], revealEdgeIds: [`e_${root.id}_${uat.id}_subdomain_of`], emphasis: "shadow" },
    { t: 16, headline: "Mail infrastructure mapped", detail: `mail.${D}`, revealAssetIds: [mail.id], revealEdgeIds: [`e_${root.id}_${mail.id}_mail_for`] },
  ];
  return { slug: "atlas", name: "Atlas Financial", domain: D, assets, edges, timeline, linkedFromPrimary: [`www.${D}`] };
}
