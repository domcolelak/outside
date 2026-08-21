/**
 * Remediation Coverage Registry — what OUTSIDE can actually do about a finding.
 *
 * The detection registry in ./registry.ts answers "what can OUTSIDE see?". This
 * one answers the question the product is now judged on: for a given finding
 * category and provider, can OUTSIDE guide the fix, preview it, apply it, verify
 * it from outside, and reverse it?
 *
 * It exists so the UI never has to guess. "Fix it for me" may only appear where
 * a real capability says one_click, and the accompanying test refuses to let a
 * capability claim apply without also claiming verify and rollback — a change
 * that cannot be checked or reversed is not one OUTSIDE offers to make.
 *
 * Coverage is measured here, not in finding volume: closure is the product.
 */

/**
 * What OUTSIDE can do end to end for a category.
 *
 * detect_only  — it is observed and reported; the operator decides what to do
 * guide_only   — a deterministic recommendation explains the fix to perform
 * preview      — the exact change can be shown, but not written by OUTSIDE
 * one_click    — OUTSIDE can apply it, verify it externally and roll it back
 * autopilot    — the above, without waiting for a human, once policy allows it
 */
export type RemediationSupport = "detect_only" | "guide_only" | "preview" | "one_click" | "autopilot";

export type RiskClass = "low" | "medium" | "high";

export interface RemediationCapability {
  /** Stable identifier, referenced by verifiers and by applied records. */
  id: string;
  name: string;
  /** Finding categories this capability addresses. Must be categories OUTSIDE detects. */
  findingCategories: string[];
  /** The provider that performs the change, or null when no provider is involved. */
  provider: "cloudflare" | null;
  support: RemediationSupport;
  guideSupported: boolean;
  previewSupported: boolean;
  applySupported: boolean;
  /** Verified by OUTSIDE's own external observation — never by the provider's own answer. */
  verifySupported: boolean;
  rollbackSupported: boolean;
  /**
   * Autopilot stays false until there is production evidence that apply, verify
   * and rollback behave. An automated change with a wrong blast radius is an
   * outage caused by a security tool.
   */
  autopilotEligible: boolean;
  /** Least privilege the provider credential needs, in the provider's own words. */
  requiredScopes: string[];
  riskClass: RiskClass;
  /** The module that implements the change, or null when nothing writes. */
  source: string | null;
}

/**
 * One entry per category OUTSIDE detects. Downgrading is always safe; claiming
 * more than the code does is the failure this registry exists to prevent.
 */
export const REMEDIATION_CAPABILITIES: readonly RemediationCapability[] = [
  {
    id: "REM-CF-DMARC-MONITORING",
    name: "Add a DMARC policy in monitor mode",
    findingCategories: ["mail-security"],
    provider: "cloudflare",
    support: "one_click",
    guideSupported: true,
    previewSupported: true,
    applySupported: true,
    verifySupported: true,
    rollbackSupported: true,
    autopilotEligible: false,
    requiredScopes: ["Zone:Read", "DNS:Edit"],
    riskClass: "low",
    source: "lib/integrations/remediate.ts",
  },

  // ---- Guided: Aegis produces a deterministic recommendation, OUTSIDE writes nothing ----
  {
    id: "REM-GUIDE-SECURITY-HEADERS",
    name: "Add the missing baseline response headers",
    findingCategories: ["security-headers"],
    provider: null,
    support: "guide_only",
    guideSupported: true,
    previewSupported: false,
    applySupported: false,
    verifySupported: false,
    rollbackSupported: false,
    autopilotEligible: false,
    requiredScopes: [],
    riskClass: "low",
    source: "lib/aegis/recommendations.ts",
  },
  {
    id: "REM-GUIDE-CERTIFICATE-LIFECYCLE",
    name: "Renew or automate certificate issuance",
    findingCategories: ["certificate-expiry"],
    provider: null,
    support: "guide_only",
    guideSupported: true,
    previewSupported: false,
    applySupported: false,
    verifySupported: false,
    rollbackSupported: false,
    autopilotEligible: false,
    requiredScopes: [],
    riskClass: "low",
    source: "lib/aegis/recommendations.ts",
  },
  {
    id: "REM-GUIDE-NON-PRODUCTION",
    name: "Restrict a publicly reachable non-production surface",
    findingCategories: ["non-production-exposure"],
    provider: null,
    support: "guide_only",
    guideSupported: true,
    previewSupported: false,
    applySupported: false,
    verifySupported: false,
    rollbackSupported: false,
    autopilotEligible: false,
    requiredScopes: [],
    riskClass: "medium",
    source: "lib/aegis/recommendations.ts",
  },
  {
    id: "REM-GUIDE-SHADOW-ASSET",
    name: "Bring an unrecognized asset under ownership",
    findingCategories: ["shadow-asset"],
    provider: null,
    support: "guide_only",
    guideSupported: true,
    previewSupported: false,
    applySupported: false,
    verifySupported: false,
    rollbackSupported: false,
    autopilotEligible: false,
    requiredScopes: [],
    riskClass: "medium",
    source: "lib/aegis/recommendations.ts",
  },
  {
    id: "REM-GUIDE-AUTH-SURFACE",
    name: "Reduce an exposed authentication surface",
    findingCategories: ["auth-surface"],
    provider: null,
    support: "guide_only",
    guideSupported: true,
    previewSupported: false,
    applySupported: false,
    verifySupported: false,
    rollbackSupported: false,
    autopilotEligible: false,
    requiredScopes: [],
    riskClass: "medium",
    source: "lib/aegis/recommendations.ts",
  },
  {
    id: "REM-GUIDE-SURFACE-CHANGE",
    name: "Review a change in the external surface",
    findingCategories: ["surface-change"],
    provider: null,
    support: "guide_only",
    guideSupported: true,
    previewSupported: false,
    applySupported: false,
    verifySupported: false,
    rollbackSupported: false,
    autopilotEligible: false,
    requiredScopes: [],
    riskClass: "low",
    source: "lib/aegis/recommendations.ts",
  },

  // ---- Detect only: observed and reported, no deterministic fix OUTSIDE can direct ----
  {
    id: "REM-DETECT-KNOWN-VULNERABILITY",
    name: "Disclosed version matched against known vulnerabilities",
    findingCategories: ["known-vulnerability"],
    provider: null,
    support: "detect_only",
    guideSupported: false,
    previewSupported: false,
    applySupported: false,
    verifySupported: false,
    rollbackSupported: false,
    autopilotEligible: false,
    requiredScopes: [],
    riskClass: "high",
    source: null,
  },
  {
    id: "REM-DETECT-EXPOSED-SERVICE",
    name: "Exposed non-web service",
    findingCategories: ["exposed-service"],
    provider: null,
    support: "detect_only",
    guideSupported: false,
    previewSupported: false,
    applySupported: false,
    verifySupported: false,
    rollbackSupported: false,
    autopilotEligible: false,
    requiredScopes: [],
    riskClass: "high",
    source: null,
  },
  {
    id: "REM-DETECT-INSECURE-REDIRECT",
    name: "HTTPS to HTTP downgrade redirect",
    findingCategories: ["insecure-redirect"],
    provider: null,
    support: "detect_only",
    guideSupported: false,
    previewSupported: false,
    applySupported: false,
    verifySupported: false,
    rollbackSupported: false,
    autopilotEligible: false,
    requiredScopes: [],
    riskClass: "medium",
    source: null,
  },
  {
    id: "REM-DETECT-DOMAIN-EXPIRY",
    name: "Domain registration approaching expiry",
    findingCategories: ["domain-expiry"],
    provider: null,
    support: "detect_only",
    guideSupported: false,
    previewSupported: false,
    applySupported: false,
    verifySupported: false,
    rollbackSupported: false,
    autopilotEligible: false,
    requiredScopes: [],
    riskClass: "high",
    source: null,
  },
  {
    id: "REM-DETECT-BREACH-EXPOSURE",
    name: "Credentials exposed in a known breach",
    findingCategories: ["breach-exposure"],
    provider: null,
    support: "detect_only",
    guideSupported: false,
    previewSupported: false,
    applySupported: false,
    verifySupported: false,
    rollbackSupported: false,
    autopilotEligible: false,
    requiredScopes: [],
    riskClass: "high",
    source: null,
  },
  {
    id: "REM-DETECT-THREAT-INTELLIGENCE",
    name: "Third-party reputation signal",
    findingCategories: ["threat-intelligence"],
    provider: null,
    support: "detect_only",
    guideSupported: false,
    previewSupported: false,
    applySupported: false,
    verifySupported: false,
    rollbackSupported: false,
    autopilotEligible: false,
    requiredScopes: [],
    riskClass: "medium",
    source: null,
  },
  {
    id: "REM-DETECT-INFRASTRUCTURE-CONCENTRATION",
    name: "Concentration of the surface on one provider",
    findingCategories: ["infrastructure-concentration"],
    provider: null,
    support: "detect_only",
    guideSupported: false,
    previewSupported: false,
    applySupported: false,
    verifySupported: false,
    rollbackSupported: false,
    autopilotEligible: false,
    requiredScopes: [],
    riskClass: "low",
    source: null,
  },
];

/** Resolve by identifier. */
export function remediationCapability(id: string): RemediationCapability | undefined {
  return REMEDIATION_CAPABILITIES.find((entry) => entry.id === id);
}

/** Every capability addressing a finding category, best support first. */
const SUPPORT_RANK: Record<RemediationSupport, number> = { autopilot: 4, one_click: 3, preview: 2, guide_only: 1, detect_only: 0 };

export function remediationsFor(category: string): RemediationCapability[] {
  return REMEDIATION_CAPABILITIES.filter((entry) => entry.findingCategories.includes(category)).sort(
    (a, b) => SUPPORT_RANK[b.support] - SUPPORT_RANK[a.support],
  );
}

/**
 * The single question the UI asks before rendering "Fix it for me". A provider
 * that is not connected cannot fix anything, so the caller passes what it has.
 */
export function oneClickCapability(category: string, connectedProviders: readonly string[]): RemediationCapability | null {
  return (
    remediationsFor(category).find(
      (entry) => entry.support === "one_click" && entry.provider !== null && connectedProviders.includes(entry.provider),
    ) ?? null
  );
}

/** Coverage summary — the metric worth reporting, unlike finding counts. */
export function remediationCoverage(): { total: number; guided: number; oneClick: number; verifiable: number; reversible: number } {
  return {
    total: REMEDIATION_CAPABILITIES.length,
    guided: REMEDIATION_CAPABILITIES.filter((entry) => entry.guideSupported).length,
    oneClick: REMEDIATION_CAPABILITIES.filter((entry) => entry.support === "one_click").length,
    verifiable: REMEDIATION_CAPABILITIES.filter((entry) => entry.verifySupported).length,
    reversible: REMEDIATION_CAPABILITIES.filter((entry) => entry.rollbackSupported).length,
  };
}
