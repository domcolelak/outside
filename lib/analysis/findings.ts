/**
 * Finding generation. Findings are reviewable concerns derived from asset
 * signals + evidence. Each keeps the observation (fact) separate from the
 * inference and the concern, and cites its evidence and discovery method.
 */

import type { Asset, Edge, Finding, Signal } from "@/lib/types";
import { PRIORITY_RANK } from "@/lib/analysis/priority";
import { correlateKnownVulnerabilities } from "@/lib/analysis/vulnerabilities";
import { currentKevIndex, type KevIndex } from "@/lib/analysis/kev";
import { generateIntelFindings } from "@/lib/intel/findings";
import { generateMisconfigurationFindings } from "@/lib/analysis/misconfig";
import { generateExposedServiceFindings } from "@/lib/analysis/services";
import { generateConcentrationFindings } from "@/lib/analysis/concentration";

function fid(assetId: string, code: string) {
  return `find_${assetId}_${code}`.replace(/[^a-z0-9_]/gi, "_");
}

function signal(asset: Asset, code: string): Signal | undefined {
  return asset.signals.find((s) => s.code === code);
}

export function generateFindings(assets: Asset[], edges: Edge[], now: string, kev: KevIndex = currentKevIndex()): Finding[] {
  const out: Finding[] = [];

  for (const asset of assets) {
    const shadow = signal(asset, "asset.shadow");
    if (shadow) {
      out.push({
        id: fid(asset.id, "shadow"),
        title: "Possible shadow / forgotten asset",
        priority: asset.priority === "critical" ? "critical" : "high",
        confidence: shadow.confidence,
        assetId: asset.id,
        category: "shadow-asset",
        observation: `${asset.label} is publicly reachable and shares the organization's registrable domain.`,
        inference: shadow.label,
        concern: "An unmanaged or forgotten public asset may lack current ownership, patching, or monitoring.",
        reasoning: shadow.rationale,
        recommendation: "Confirm ownership, business purpose, responsible team, and whether the asset is still required. Decommission if not.",
        evidence: asset.evidence,
        discoveryMethod: asset.discoveredVia[0] ?? "dns",
        createdAt: now,
      });
    }

    const env = signal(asset, "env.nonprod");
    if (env && !shadow) {
      out.push({
        id: fid(asset.id, "nonprod"),
        title: "Possible non-production environment publicly reachable",
        priority: "high",
        confidence: env.confidence,
        assetId: asset.id,
        category: "non-production-exposure",
        observation: `${asset.label} is publicly reachable.`,
        inference: env.label,
        concern: "Non-production environments often carry weaker controls, test data, or debug surfaces and may not be intended for public exposure.",
        reasoning: env.rationale,
        recommendation: "Verify this environment should be internet-facing. If not, restrict access (IP allowlist, VPN, or authentication) or remove it.",
        evidence: asset.evidence,
        discoveryMethod: asset.discoveredVia[0] ?? "certificate_transparency",
        createdAt: now,
      });
    }

    const auth = signal(asset, "surface.auth");
    if (auth) {
      out.push({
        id: fid(asset.id, "auth"),
        title: "Public authentication or administration surface",
        priority: "medium",
        confidence: auth.confidence,
        assetId: asset.id,
        category: "auth-surface",
        observation: `${asset.label} exposes a naming pattern consistent with a login, remote-access, or admin surface.`,
        inference: auth.label,
        concern: "Public authentication surfaces are a natural target for credential-based attacks and should be minimized and hardened.",
        reasoning: auth.rationale,
        recommendation: "Confirm the surface is intended to be public. Ensure MFA, rate limiting, and monitoring are in place; consider restricting to known networks.",
        evidence: asset.evidence,
        discoveryMethod: asset.discoveredVia[0] ?? "dns",
        createdAt: now,
      });
    }

    if (asset.attrs.newlyObserved === true) {
      out.push({
        id: fid(asset.id, "new"),
        title: "New external asset detected",
        priority: (signal(asset, "surface.api") || signal(asset, "surface.auth")) ? "high" : "medium",
        confidence: 0.9,
        assetId: asset.id,
        category: "surface-change",
        observation: `${asset.label} was first observed in the most recent scan window.`,
        concern: "New public assets change the external surface and may not yet be inventoried or reviewed by the responsible team.",
        reasoning: "Comparison against the previous external-surface snapshot shows this hostname was not present before.",
        recommendation: "Confirm this asset was intentionally published and is owned by a known team.",
        evidence: asset.evidence,
        discoveryMethod: asset.discoveredVia[0] ?? "dns",
        createdAt: now,
      });
    }
  }

  // Org-level mail security signal (attached to the mail asset if present).
  const mail = assets.find((a) => a.kind === "mail_service");
  if (mail && mail.attrs.spf === "missing") {
    out.push({
      id: fid(mail.id, "mail"),
      title: "Mail security configuration requires review",
      priority: "medium",
      confidence: 0.8,
      assetId: mail.id,
      category: "mail-security",
      observation: "No SPF record was observed for the organization's mail domain.",
      inference: "Missing SPF weakens protection against sender spoofing.",
      concern: "Absent SPF/DMARC makes the domain easier to spoof in phishing campaigns targeting staff, customers, or partners.",
      reasoning: "Public DNS TXT records did not include a valid v=spf1 policy.",
      recommendation: "Publish SPF, DKIM, and a DMARC policy; monitor DMARC aggregate reports before moving to enforcement.",
      evidence: mail.evidence,
      discoveryMethod: "dns_txt",
      createdAt: now,
    });
  }

  // Correlate disclosed technology versions against known vulnerabilities / EOL
  // branches, enriched with live CISA KEV status when the catalogue is synced.
  out.push(...correlateKnownVulnerabilities(assets, now, kev));

  // Threat-intelligence findings from optional enrichment attributes. Absent on
  // demo and anonymous scans, so this is a no-op unless enrichment ran.
  out.push(...generateIntelFindings(assets, now));

  // Misconfiguration findings from the passive HTTP/TLS observation (verified
  // targets only). No-op on scans that never ran active observation.
  out.push(...generateMisconfigurationFindings(assets, now));

  // Internet-exposed non-web services from optional Censys enrichment. No-op
  // unless Censys ran (verified targets, operator-keyed).
  out.push(...generateExposedServiceFindings(assets, now));

  // Concentration risk / single points of failure from the Digital Twin's
  // dependency graph. No-op below the concentration threshold.
  out.push(...generateConcentrationFindings(assets, edges, now));

  return out.sort((a, b) => {
    const p = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
    return p !== 0 ? p : b.confidence - a.confidence;
  });
}
