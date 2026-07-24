/**
 * Aegis recommendation engine (deterministic).
 *
 * Consumes a finalized ScanResult (assets, findings, score, change history) and
 * produces prioritized recommendations. Each recommendation's `estimatedReduction`
 * is read directly from the protection-posture score component it neutralizes, so the
 * "potential score" is honest — no invented numbers, no fabricated risk.
 */

import type { Asset, Evidence, Priority, ScanResult } from "@/lib/types";
import type { Posture, Recommendation, RecommendationCategory } from "./types";
import { headerProposal, mailProposal } from "./proposal";
import { PRIORITY_RANK } from "@/lib/analysis/priority";

function rid(target: string, category: string): string {
  return `rec_${target}_${category}`.replace(/[^a-z0-9_]/gi, "_");
}

/** Magnitude of the named score component's penalty (0 if absent or a mitigation). */
function penaltyOf(result: ScanResult, code: string): number {
  const c = result.score.components.find((x) => x.code === code);
  return c && c.impact < 0 ? Math.abs(c.impact) : 0;
}

interface Ctx {
  result: ScanResult;
  now: string;
  assetsByCanon: Map<string, Asset>;
}

type Gen = (ctx: Ctx) => Recommendation | null;

function assetsWithSignal(result: ScanResult, code: string): Asset[] {
  return result.graph.assets.filter((a) => a.signals.some((s) => s.code === code && s.confidence >= 0.55));
}

function firstEvidence(assets: Asset[], fallback: Evidence[]): Evidence[] {
  for (const a of assets) if (a.evidence.length) return a.evidence.slice(0, 2);
  return fallback;
}

/* ---- Generators, one per protection domain ---- */

const genMailSecurity: Gen = ({ result, now }) => {
  const mail = result.graph.assets.find((a) => a.kind === "mail_service" && a.attrs.spf === "missing");
  if (!mail) return null;
  const reduction = penaltyOf(result, "mail");
  return {
    id: rid(result.target, "mail_security"),
    category: "mail_security",
    title: "Harden mail security (SPF, DKIM, DMARC)",
    priority: "high",
    confidence: 0.9,
    why: "No SPF policy was observed for the organization's mail domain, so the domain is easier to spoof in phishing.",
    evidence: mail.evidence.slice(0, 2),
    businessImpact: "Attackers can send email that appears to come from your domain, targeting staff, customers, and partners.",
    assetIds: [mail.id],
    scoreComponentCode: "mail",
    estimatedReduction: reduction,
    remediation: {
      summary: "Publish SPF, then DKIM, then a DMARC policy (start at p=none and monitor before enforcing).",
      mode: "guided",
      changesInfrastructure: true,
      connector: "dns",
      steps: [
        { instruction: "Publish an SPF TXT record", detail: 'e.g. "v=spf1 include:_spf.your-provider.com -all"' },
        { instruction: "Enable DKIM signing at your mail provider and publish the DKIM public key" },
        { instruction: "Publish a DMARC record at _dmarc", detail: '"v=DMARC1; p=none; rua=mailto:dmarc@yourdomain"' },
        { instruction: "Monitor DMARC aggregate reports, then move p=none → quarantine → reject" },
      ],
      rollback: "Remove or revert the TXT records; DNS changes are non-destructive and fully reversible.",
      proposal: mailProposal(result.target),
    },
    status: "open",
    createdAt: now,
  };
};

const genNonProd: Gen = ({ result, now }) => {
  const assets = assetsWithSignal(result, "env.nonprod");
  if (assets.length === 0) return null;
  return {
    id: rid(result.target, "non_production_exposure"),
    category: "non_production_exposure",
    title: `Restrict ${assets.length} publicly reachable non-production environment${assets.length > 1 ? "s" : ""}`,
    priority: "high",
    confidence: 0.8,
    why: "Hostnames whose naming indicates staging/dev/test/QA are publicly reachable and often carry weaker controls or debug surfaces.",
    evidence: firstEvidence(assets, []),
    businessImpact: "Non-production systems frequently expose test data, verbose errors, or default credentials that don't belong on the public internet.",
    assetIds: assets.map((a) => a.id),
    scoreComponentCode: "nonprod",
    estimatedReduction: penaltyOf(result, "nonprod"),
    remediation: {
      summary: "Put non-production environments behind an IP allowlist, VPN, or authentication — or take them offline.",
      mode: "guided",
      changesInfrastructure: true,
      connector: "cloudflare",
      steps: [
        { instruction: "Confirm each environment is intended to be internet-facing" },
        { instruction: "Apply an access policy (Cloudflare Access / WAF rule / IP allowlist) or require SSO" },
        { instruction: "Decommission environments that are no longer needed" },
      ],
      rollback: "Access policies can be disabled instantly, restoring the prior state.",
    },
    status: "open",
    createdAt: now,
  };
};

const genShadow: Gen = ({ result, now }) => {
  const assets = assetsWithSignal(result, "asset.shadow");
  if (assets.length === 0) return null;
  return {
    id: rid(result.target, "shadow_asset"),
    category: "shadow_asset",
    title: `Reclaim or decommission ${assets.length} possible shadow asset${assets.length > 1 ? "s" : ""}`,
    priority: "high",
    confidence: Math.max(...assets.map((a) => a.signals.find((s) => s.code === "asset.shadow")?.confidence ?? 0.6)),
    why: "These publicly reachable assets show signals of being unmanaged or forgotten (legacy naming, isolation, dated technology, absence from the primary site).",
    evidence: firstEvidence(assets, []),
    businessImpact: "Forgotten infrastructure is rarely patched or monitored, making it a common entry point that no one is watching.",
    assetIds: assets.map((a) => a.id),
    scoreComponentCode: "shadow",
    estimatedReduction: penaltyOf(result, "shadow"),
    remediation: {
      summary: "Confirm ownership and business purpose for each asset; decommission what isn't needed and bring the rest under management.",
      mode: "guided",
      changesInfrastructure: false,
      steps: [
        { instruction: "Identify the owning team and current purpose of each asset" },
        { instruction: "Decommission assets with no owner or purpose (remove DNS + shut down origin)" },
        { instruction: "For assets that must stay, add them to your inventory, patching, and monitoring" },
      ],
      rollback: "Inventory/monitoring changes are reversible; decommissioning should follow your change process.",
    },
    status: "open",
    createdAt: now,
  };
};

const genAuthSurface: Gen = ({ result, now }) => {
  const assets = assetsWithSignal(result, "surface.auth");
  if (assets.length === 0) return null;
  return {
    id: rid(result.target, "auth_surface"),
    category: "auth_surface",
    title: `Review ${assets.length} public authentication / admin surface${assets.length > 1 ? "s" : ""}`,
    priority: "medium",
    confidence: 0.7,
    why: "Login, remote-access, or administration surfaces are observable from the internet and are natural targets for credential-based attacks.",
    evidence: firstEvidence(assets, []),
    businessImpact: "Every public login is an attack surface for password spraying, credential stuffing, and exploitation of the auth stack.",
    assetIds: assets.map((a) => a.id),
    scoreComponentCode: "auth",
    estimatedReduction: penaltyOf(result, "auth"),
    remediation: {
      summary: "Confirm each surface must be public; enforce MFA, rate limiting, and monitoring, and restrict to known networks where possible.",
      mode: "guided",
      changesInfrastructure: true,
      connector: "cloudflare",
      steps: [
        { instruction: "Verify the surface is intended to be internet-facing" },
        { instruction: "Enforce MFA and rate limiting; enable brute-force lockout" },
        { instruction: "Restrict to corporate networks or an access proxy where feasible" },
      ],
      rollback: "Access and rate-limit policies can be relaxed instantly.",
    },
    status: "open",
    createdAt: now,
  };
};

const genSurfaceChange: Gen = ({ result, now }) => {
  const events = result.changeSummary?.events.filter((e) => e.type === "asset_appeared" || e.type === "asset_returned") ?? [];
  if (events.length === 0) return null;
  const ids = events
    .map((e) => result.graph.assets.find((a) => a.canonical === e.canonical)?.id)
    .filter((x): x is string => !!x);
  return {
    id: rid(result.target, "surface_change"),
    category: "surface_change",
    title: `Review ${events.length} newly appeared / returned public asset${events.length > 1 ? "s" : ""}`,
    priority: "high",
    confidence: 0.9,
    why: "The external surface changed since the previous scan; new or returning public assets may not yet be inventoried or owned.",
    evidence: [],
    businessImpact: "Unreviewed surface growth is how shadow IT and forgotten deployments accumulate risk unnoticed.",
    assetIds: ids,
    scoreComponentCode: "new",
    estimatedReduction: penaltyOf(result, "new"),
    remediation: {
      summary: "Confirm each change was intentional and owned by a known team; add to inventory or decommission.",
      mode: "guided",
      changesInfrastructure: false,
      steps: [
        { instruction: "Confirm each new/returned asset was published intentionally" },
        { instruction: "Assign an owner and add it to your asset inventory" },
        { instruction: "Investigate anything unexpected as possible shadow IT" },
      ],
      rollback: "Advisory only — no infrastructure change is applied.",
    },
    status: "open",
    createdAt: now,
  };
};

const genThirdParty: Gen = ({ result, now }) => {
  const assets = result.graph.assets.filter((a) => a.kind === "third_party");
  if (assets.length === 0) return null;
  return {
    id: rid(result.target, "third_party"),
    category: "third_party",
    title: `Monitor ${assets.length} third-party dependenc${assets.length > 1 ? "ies" : "y"} exposed via DNS`,
    priority: "low",
    confidence: 0.7,
    why: "Public DNS delegates parts of your surface to third-party SaaS providers, extending your trust boundary to their security.",
    evidence: firstEvidence(assets, []),
    businessImpact: "A compromised or misconfigured third-party service can be leveraged against your domain (e.g. subdomain takeover).",
    assetIds: assets.map((a) => a.id),
    estimatedReduction: 0,
    remediation: {
      summary: "Inventory third-party delegations and watch for dangling CNAMEs (subdomain-takeover risk).",
      mode: "guided",
      changesInfrastructure: false,
      steps: [
        { instruction: "List every CNAME delegation to a third-party provider" },
        { instruction: "Remove DNS records that point to deprovisioned services (dangling CNAMEs)" },
        { instruction: "Track each provider's security posture and incident notifications" },
      ],
      rollback: "Advisory only.",
    },
    status: "open",
    createdAt: now,
  };
};

const genSecurityHeaders: Gen = ({ result, now }) => {
  const observed = result.graph.assets.find((a) => Array.isArray(a.attrs.missingHeaders));
  const missing = (observed?.attrs.missingHeaders as string[] | undefined) ?? [];
  if (!observed || missing.length < 2) return null;
  return {
    id: rid(result.target, "security_headers"),
    category: "security_headers",
    title: `Add ${missing.length} missing security headers to ${observed.label}`,
    priority: "medium",
    confidence: 0.95,
    why: `The primary web surface responded without baseline security headers: ${missing.join(", ")}.`,
    evidence: observed.evidence.slice(0, 2),
    businessImpact: "Missing headers leave the site more exposed to clickjacking, MIME sniffing, protocol downgrade, and referrer leakage.",
    assetIds: [observed.id],
    scoreComponentCode: "headers",
    estimatedReduction: penaltyOf(result, "headers"),
    remediation: {
      summary: "Add the missing response headers at your edge/CDN or web server.",
      mode: "guided",
      changesInfrastructure: true,
      connector: "cloudflare",
      steps: [
        { instruction: "Enable HSTS", detail: "Strict-Transport-Security: max-age=31536000; includeSubDomains" },
        { instruction: "Set X-Content-Type-Options: nosniff and a X-Frame-Options / frame-ancestors policy" },
        { instruction: "Add a Content-Security-Policy (start report-only) and a Referrer-Policy" },
      ],
      rollback: "Headers can be removed instantly at the edge with no data impact.",
      proposal: headerProposal(result.target, observed.label, missing),
    },
    status: "open",
    createdAt: now,
  };
};

const genCertLifecycle: Gen = ({ result, now }) => {
  const asset = result.graph.assets.find((a) => typeof a.attrs.certDaysToExpiry === "number" && (a.attrs.certDaysToExpiry as number) < 21);
  if (!asset) return null;
  const days = asset.attrs.certDaysToExpiry as number;
  return {
    id: rid(result.target, "certificate_lifecycle"),
    category: "certificate_lifecycle",
    title: days < 0 ? `Renew the expired certificate on ${asset.label}` : `Certificate on ${asset.label} expires in ${days} days`,
    priority: days < 0 ? "critical" : "high",
    confidence: 0.98,
    why: `The TLS handshake reported a certificate ${days < 0 ? "that has already expired" : `expiring in ${days} days`}.`,
    evidence: asset.evidence.slice(0, 2),
    businessImpact: "An expired certificate breaks HTTPS for every visitor and erodes trust; last-minute renewals are a common outage cause.",
    assetIds: [asset.id],
    scoreComponentCode: "cert_expiry",
    estimatedReduction: penaltyOf(result, "cert_expiry"),
    remediation: {
      summary: "Renew the certificate and enable automated renewal so this never becomes urgent again.",
      mode: "guided",
      changesInfrastructure: true,
      connector: "acme",
      steps: [
        { instruction: "Renew the certificate now" },
        { instruction: "Enable automated renewal (ACME / your CDN's managed certificates)" },
        { instruction: "Add expiry monitoring so you're alerted well before 21 days" },
      ],
      rollback: "Certificate renewal is additive; the prior certificate remains valid until its expiry.",
    },
    status: "open",
    createdAt: now,
  };
};

const GENERATORS: Gen[] = [
  genCertLifecycle,
  genSurfaceChange,
  genShadow,
  genNonProd,
  genMailSecurity,
  genAuthSurface,
  genSecurityHeaders,
  genThirdParty,
];

/** Build the full protection posture for a finalized scan. */
export function buildPosture(result: ScanResult): Posture {
  const now = new Date().toISOString();
  const ctx: Ctx = { result, now, assetsByCanon: new Map(result.graph.assets.map((a) => [a.canonical, a])) };

  const recommendations = GENERATORS.map((g) => g(ctx))
    .filter((r): r is Recommendation => r !== null)
    .sort((a, b) => b.estimatedReduction - a.estimatedReduction || PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]);

  const currentScore = result.score.value;
  const openReduction = recommendations
    .filter((r) => r.status === "open" || r.status === "acknowledged" || r.status === "in_progress")
    .reduce((sum, r) => sum + r.estimatedReduction, 0);
  const potentialScore = Math.max(0, Math.min(100, currentScore + openReduction));

  const openByPriority: Posture["openByPriority"] = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const r of recommendations) if (r.status === "open") openByPriority[r.priority] += 1;

  const gain = potentialScore - currentScore;
  const summary =
    recommendations.length === 0
      ? "No protection actions are outstanding — the observable surface is well contained."
      : `Resolving the ${recommendations.length} open recommendation${recommendations.length > 1 ? "s" : ""} would improve your protection posture from ${currentScore} to ${potentialScore}${gain > 0 ? ` (+${gain})` : ""}.`;

  return { currentScore, potentialScore, recommendations, summary, openByPriority };
}
