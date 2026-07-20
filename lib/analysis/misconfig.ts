/**
 * Misconfiguration findings derived from the passive HTTP/TLS observation the
 * scan already captured for verified targets. No new requests are made — these
 * read attributes set by the discovery engine (missing security headers,
 * redirect target, certificate/domain expiry) and turn them into scored,
 * evidence-grounded findings that feed the score and Aegis. Absent on scans
 * that never ran active observation, so anonymous scans produce nothing here.
 */

import type { Asset, Finding, Priority } from "@/lib/types";

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function fid(assetId: string, code: string): string {
  return `find_${assetId}_${code}`.replace(/[^a-z0-9_]/gi, "_");
}

export function generateMisconfigurationFindings(assets: Asset[], now: string): Finding[] {
  const out: Finding[] = [];

  for (const asset of assets) {
    const label = asset.label;

    // 1. Missing baseline HTTP security headers.
    const missing = strings(asset.attrs.missingHeaders);
    if (missing.length > 0) {
      out.push({
        id: fid(asset.id, "headers"),
        title: "Missing HTTP security headers",
        priority: missing.length >= 2 ? "medium" : "low",
        confidence: 0.95,
        assetId: asset.id,
        category: "security-headers",
        observation: `${label} responded without ${missing.length} baseline security header(s): ${missing.join(", ")}.`,
        inference: "Absent response headers weaken the browser's defences against clickjacking, MIME sniffing, protocol downgrade, and cross-site scripting.",
        concern: "These are observed gaps in defence-in-depth, not an exploited weakness. They lower the bar for browser-side attacks against this surface.",
        reasoning: "Deterministic comparison of the observed response headers against a baseline security-header set.",
        recommendation: `Add the missing headers (${missing.join(", ")}). Prefer a strict Content-Security-Policy, HSTS with a long max-age, X-Content-Type-Options: nosniff, and a restrictive Referrer-Policy.`,
        evidence: asset.evidence,
        discoveryMethod: "http_observation",
        createdAt: now,
      });
    }

    // 2. Insecure redirect (HTTPS downgraded to plain HTTP).
    const redirect = typeof asset.attrs.redirectLocation === "string" ? asset.attrs.redirectLocation : "";
    if (/^http:\/\//i.test(redirect)) {
      out.push({
        id: fid(asset.id, "downgrade"),
        title: "Redirect downgrades HTTPS to HTTP",
        priority: "medium",
        confidence: 0.9,
        assetId: asset.id,
        category: "insecure-redirect",
        observation: `${label} redirects to a plain-HTTP location (${redirect.slice(0, 120)}).`,
        inference: "A redirect from HTTPS to HTTP exposes the subsequent request to interception and tampering on the network path.",
        concern: "The observed redirect target is unencrypted. It does not prove interception occurred, but it removes transport protection for anyone following it.",
        reasoning: "The observed redirect Location header points to an http:// URL.",
        recommendation: "Redirect only to HTTPS targets and serve HSTS so browsers refuse the downgrade.",
        evidence: asset.evidence,
        discoveryMethod: "http_observation",
        createdAt: now,
      });
    }

    // 3. Expiring TLS certificate.
    const certDays = num(asset.attrs.certDaysToExpiry);
    if (certDays !== null && certDays <= 30) {
      const priority: Priority = certDays <= 7 ? "high" : certDays <= 14 ? "medium" : "low";
      out.push({
        id: fid(asset.id, "cert_expiry"),
        title: certDays <= 0 ? "TLS certificate has expired" : "TLS certificate is expiring soon",
        priority: certDays <= 0 ? "high" : priority,
        confidence: 0.97,
        assetId: asset.id,
        category: "certificate-expiry",
        observation: `${label} presents a TLS certificate that ${certDays <= 0 ? "has already expired" : `expires in ${certDays} day(s)`}${typeof asset.attrs.certNotAfter === "string" ? ` (not-after ${asset.attrs.certNotAfter.slice(0, 10)})` : ""}.`,
        inference: "An expired or soon-to-expire certificate breaks HTTPS for visitors and can indicate unmanaged or forgotten renewal automation.",
        concern: "Certificate lifecycle is observed directly. An outage from expiry is a customer-facing availability and trust issue.",
        reasoning: "The observed certificate's validity window is within the renewal-attention threshold.",
        recommendation: "Renew the certificate and put automated renewal with alerting at 30, 14, 7 and 1 days before expiry in place.",
        evidence: asset.evidence,
        discoveryMethod: "http_observation",
        createdAt: now,
      });
    }
  }

  // 4. Domain registration expiring (root domain) — a takeover / outage risk.
  const root = assets.find((a) => a.kind === "root_domain");
  const domainDays = root ? num(root.attrs.domainDaysToExpiry) : null;
  if (root && domainDays !== null && domainDays <= 45) {
    out.push({
      id: fid(root.id, "domain_expiry"),
      title: domainDays <= 0 ? "Domain registration has lapsed" : "Domain registration is expiring soon",
      priority: domainDays <= 14 ? "high" : "medium",
      confidence: 0.9,
      assetId: root.id,
      category: "domain-expiry",
      observation: `${root.label}'s registration ${domainDays <= 0 ? "has lapsed" : `expires in ${domainDays} day(s)`}${typeof root.attrs.domainExpiresAt === "string" ? ` (${root.attrs.domainExpiresAt.slice(0, 10)})` : ""}.`,
      inference: "A lapsed registration can drop the domain, breaking every service on it and opening it to re-registration by a third party.",
      concern: "Registration expiry is observed from RDAP. It is an availability and domain-takeover risk, not a current compromise.",
      reasoning: "The observed RDAP expiry date is within the renewal-attention threshold.",
      recommendation: "Renew the registration, enable registrar auto-renew and a registrar lock, and alert well ahead of expiry.",
      evidence: root.evidence,
      discoveryMethod: "domain_registration",
      createdAt: now,
    });
  }

  return out;
}
