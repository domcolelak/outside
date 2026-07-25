/**
 * OUTSIDE Assess — the safe, verified security-check catalogue.
 *
 * Assess does not re-implement detection. It is a versioned, authorized framing
 * OVER the deterministic findings the scan pipeline already produces
 * (lib/analysis/*, lib/intel/*): a named checklist where each check either
 * passes or reports the findings that made it fail, with evidence and remediation.
 *
 * Every check here is passive/observational or a safe, bounded configuration
 * review. There are NO exploit, brute-force, or destructive checks, and none can
 * be added to this catalogue by design — Assess consumes finding categories, and
 * the scan pipeline never produces exploitation evidence.
 */

import type { Finding, Priority } from "@/lib/types";

export const ASSESS_CATALOGUE_VERSION = "2026-07-25";

export type CheckStatus = "pass" | "fail" | "not_evaluated";

export interface AssessCheck {
  id: string;
  /** Bumped when the check's meaning changes, so a run records what it meant. */
  version: string;
  title: string;
  /** The deterministic finding category this check evaluates. */
  category: string;
  /** All Assess checks are safe on verified targets — never exploitation. */
  mode: "verified-safe";
  rationale: string;
  remediation: string;
  references: string[];
}

/** The catalogue. Each entry maps a safe finding category to a named check. */
export const ASSESS_CHECKS: readonly AssessCheck[] = [
  {
    id: "tls-certificate", version: "1", title: "TLS certificate validity and lifetime",
    category: "certificate-expiry", mode: "verified-safe",
    rationale: "An expired or soon-to-expire certificate breaks trust and can take a service offline.",
    remediation: "Renew before expiry and automate renewal (e.g. ACME).",
    references: ["https://datatracker.ietf.org/doc/html/rfc5280"],
  },
  {
    id: "http-security-headers", version: "1", title: "HTTP security headers",
    category: "security-headers", mode: "verified-safe",
    rationale: "Missing baseline headers (HSTS, X-Content-Type-Options, frame protection) weaken defence in depth.",
    remediation: "Add the missing response headers on the primary web surface.",
    references: ["https://owasp.org/www-project-secure-headers/"],
  },
  {
    id: "transport-downgrade", version: "1", title: "Transport security (no HTTPS→HTTP downgrade)",
    category: "insecure-redirect", mode: "verified-safe",
    rationale: "A redirect from HTTPS to HTTP exposes traffic to interception.",
    remediation: "Serve HTTPS end to end and enable HSTS.",
    references: ["https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security"],
  },
  {
    id: "mail-authentication", version: "1", title: "Mail authentication (SPF / DKIM / DMARC)",
    category: "mail-security", mode: "verified-safe",
    rationale: "Absent mail-authentication records make the domain easy to spoof in phishing.",
    remediation: "Publish SPF and a DMARC policy; sign mail with DKIM. Start DMARC at p=none and monitor.",
    references: ["https://datatracker.ietf.org/doc/html/rfc7489"],
  },
  {
    id: "known-vulnerability-correlation", version: "1", title: "Known-vulnerability correlation",
    category: "known-vulnerability", mode: "verified-safe",
    rationale: "A disclosed technology version matched against a curated CVE set (enriched with CISA KEV / EPSS) is an item to confirm and patch — never a confirmed exploit.",
    remediation: "Confirm the version and patch or upgrade the affected technology.",
    references: ["https://www.cisa.gov/known-exploited-vulnerabilities-catalog"],
  },
  {
    id: "exposed-services", version: "1", title: "Exposed non-web services",
    category: "exposed-service", mode: "verified-safe",
    rationale: "Databases, admin panels or remote-access services reachable from the internet expand the attack surface.",
    remediation: "Restrict exposure to known networks, require authentication, or move behind a VPN.",
    references: [],
  },
  {
    id: "authentication-surface", version: "1", title: "Public authentication / admin surfaces",
    category: "auth-surface", mode: "verified-safe",
    rationale: "Public login and admin surfaces are natural credential-attack targets and should be minimised and hardened.",
    remediation: "Confirm the surface should be public; enforce MFA, rate limiting and monitoring.",
    references: [],
  },
  {
    id: "non-production-exposure", version: "1", title: "Non-production environments publicly reachable",
    category: "non-production-exposure", mode: "verified-safe",
    rationale: "Staging and test environments often carry weaker controls and debug surfaces not intended for the public.",
    remediation: "Restrict to an allowlist/VPN or remove the public exposure.",
    references: [],
  },
  {
    id: "shadow-assets", version: "1", title: "Possible shadow / forgotten assets",
    category: "shadow-asset", mode: "verified-safe",
    rationale: "Unmanaged public assets may lack current ownership, patching or monitoring.",
    remediation: "Confirm ownership and purpose; decommission if no longer needed.",
    references: [],
  },
  {
    id: "infrastructure-concentration", version: "1", title: "Infrastructure concentration / single points of failure",
    category: "infrastructure-concentration", mode: "verified-safe",
    rationale: "Heavy reliance on one provider, nameserver or address concentrates blast radius.",
    remediation: "Review whether critical dependencies warrant redundancy.",
    references: [],
  },
  {
    id: "domain-registration", version: "1", title: "Domain registration lifetime",
    category: "domain-expiry", mode: "verified-safe",
    rationale: "A lapsing domain registration risks loss of the domain and dependent services.",
    remediation: "Renew the registration and enable auto-renew and registrar lock.",
    references: [],
  },
];

const PRIORITY_RANK: Record<Priority, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };

export interface AssessCheckResult {
  check: AssessCheck;
  status: CheckStatus;
  /** Highest severity among the findings that failed the check. */
  severity: Priority | null;
  findingIds: string[];
}

export interface AssessResult {
  catalogueVersion: string;
  results: AssessCheckResult[];
  summary: { total: number; passed: number; failed: number; failedBySeverity: Record<string, number> };
}

/**
 * Evaluate a verified scan's findings against the catalogue. Pure: given the same
 * findings it always yields the same assessment. A check with no matching finding
 * passed (the scan ran the detector and observed nothing) — this is only sound
 * because Assess runs on a verified, actively-observed scan where every detector
 * executes.
 */
export function assess(findings: Finding[]): AssessResult {
  const failedBySeverity: Record<string, number> = {};
  let passed = 0;
  let failed = 0;

  const results = ASSESS_CHECKS.map<AssessCheckResult>((check) => {
    const matched = findings.filter((finding) => finding.category === check.category);
    if (matched.length === 0) {
      passed += 1;
      return { check, status: "pass", severity: null, findingIds: [] };
    }
    failed += 1;
    const severity = matched.reduce<Priority>((worst, finding) => (PRIORITY_RANK[finding.priority] > PRIORITY_RANK[worst] ? finding.priority : worst), "info");
    failedBySeverity[severity] = (failedBySeverity[severity] ?? 0) + 1;
    return { check, status: "fail", severity, findingIds: matched.map((finding) => finding.id) };
  });

  return {
    catalogueVersion: ASSESS_CATALOGUE_VERSION,
    results,
    summary: { total: results.length, passed, failed, failedBySeverity },
  };
}
