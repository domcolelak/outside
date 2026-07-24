/**
 * Protection-posture score.
 *
 * Deterministic and fully explainable: the value is 100 minus weighted penalties
 * plus bounded mitigations, clamped to [0,100]. It measures how well-managed and
 * contained the *observable external surface* is — NOT the probability of being
 * hacked. Every point of movement maps to a named component.
 */

import type { Asset, ExposureScore, Finding, ScoreComponent } from "@/lib/types";

const WEIGHTS = {
  shadowAsset: 6, // per shadow asset
  nonProd: 7, // per non-production environment signal
  authSurface: 4, // per exposed auth/admin surface
  newAsset: 4, // per newly-appeared asset
  mailSecurity: 7, // missing SPF/DMARC
  perApiSurface: 2, // per exposed API surface
  cdnMitigation: 8, // primary web fronted by CDN/WAF
  containedMitigation: 6, // no unexpected service diversity
} as const;

function count(assets: Asset[], pred: (a: Asset) => boolean) {
  return assets.filter(pred).length;
}

function hasSignal(a: Asset, code: string) {
  return a.signals.some((s) => s.code === code && s.confidence >= 0.55);
}

export function computeExposureScore(assets: Asset[], findings: Finding[]): ExposureScore {
  const components: ScoreComponent[] = [];

  const shadow = count(assets, (a) => hasSignal(a, "asset.shadow"));
  if (shadow > 0) {
    components.push({
      code: "shadow",
      label: `${shadow} possible shadow asset${shadow > 1 ? "s" : ""}`,
      impact: -Math.min(24, shadow * WEIGHTS.shadowAsset),
      detail: "Publicly reachable assets that appear unmanaged or forgotten.",
    });
  }

  const nonprod = count(assets, (a) => hasSignal(a, "env.nonprod"));
  if (nonprod > 0) {
    components.push({
      code: "nonprod",
      label: `${nonprod} non-production environment signal${nonprod > 1 ? "s" : ""}`,
      impact: -Math.min(21, nonprod * WEIGHTS.nonProd),
      detail: "Hostnames whose naming indicates a non-production environment are publicly reachable.",
    });
  }

  const auth = count(assets, (a) => hasSignal(a, "surface.auth"));
  if (auth > 0) {
    components.push({
      code: "auth",
      label: `${auth} public authentication surface${auth > 1 ? "s" : ""}`,
      impact: -Math.min(12, auth * WEIGHTS.authSurface),
      detail: "Login, remote-access, or administration surfaces observable from the internet.",
    });
  }

  const api = count(assets, (a) => hasSignal(a, "surface.api"));
  if (api > 0) {
    components.push({
      code: "api",
      label: `${api} public API surface${api > 1 ? "s" : ""}`,
      impact: -Math.min(8, api * WEIGHTS.perApiSurface),
      detail: "Programmatic API endpoints observable from the internet.",
    });
  }

  const fresh = count(assets, (a) => a.attrs.newlyObserved === true);
  if (fresh > 0) {
    components.push({
      code: "new",
      label: `${fresh} new external asset${fresh > 1 ? "s" : ""} in the last window`,
      impact: -Math.min(10, fresh * WEIGHTS.newAsset),
      detail: "Recently appeared public assets that may not yet be inventoried.",
    });
  }

  const mail = assets.find((a) => a.kind === "mail_service");
  if (mail?.attrs.spf === "missing") {
    components.push({
      code: "mail",
      label: "Mail security configuration requires review",
      impact: -WEIGHTS.mailSecurity,
      detail: "No SPF policy observed; domain is easier to spoof.",
    });
  }

  // Security headers on the observed primary web surface (fact-based).
  const observed = assets.find((a) => Array.isArray(a.attrs.missingHeaders));
  if (observed) {
    const missing = (observed.attrs.missingHeaders as string[]).length;
    if (missing >= 2) {
      components.push({
        code: "headers",
        label: `${missing} security headers missing on the primary site`,
        impact: -Math.min(6, missing * 2),
        detail: "Baseline response headers (HSTS, CSP, X-Content-Type-Options, …) were not observed.",
      });
    }
  }

  // TLS certificate nearing expiry (fact-based, from the handshake).
  const certAsset = assets.find((a) => typeof a.attrs.certDaysToExpiry === "number");
  const days = certAsset?.attrs.certDaysToExpiry as number | undefined;
  if (typeof days === "number" && days < 21) {
    components.push({
      code: "cert_expiry",
      label: days < 0 ? "TLS certificate has expired" : `TLS certificate expires in ${days} day${days === 1 ? "" : "s"}`,
      impact: days < 0 ? -12 : -5,
      detail: "Short-lived certificate lifetime observed on the primary web surface.",
    });
  }

  // Known-vulnerability correlation from disclosed technology versions. Derived
  // from the same findings so the score and the finding list never disagree.
  const vulnFindings = findings.filter((f) => f.category === "known-vulnerability");
  if (vulnFindings.length) {
    const penalty = vulnFindings.reduce((sum, f) =>
      sum + (f.priority === "critical" ? 12 : f.priority === "high" ? 8 : f.priority === "medium" ? 4 : 2), 0);
    const critical = vulnFindings.filter((f) => f.priority === "critical").length;
    components.push({
      code: "known_vulnerabilities",
      label: `${vulnFindings.length} known-vulnerability correlation${vulnFindings.length > 1 ? "s" : ""}${critical ? ` (${critical} critical/KEV)` : ""}`,
      impact: -Math.min(30, penalty),
      detail: "Disclosed technology versions match known vulnerabilities or end-of-life branches; confirm against the running build.",
    });
  }

  // Mitigations.
  const cdnFronted = assets.some((a) => a.kind === "root_domain" && a.attrs.cdn && a.attrs.cdn !== "none");
  if (cdnFronted) {
    components.push({
      code: "cdn",
      label: "Primary web infrastructure fronted by CDN / WAF",
      impact: WEIGHTS.cdnMitigation,
      detail: "A CDN or reverse proxy shields origin infrastructure and adds edge protection.",
    });
  }
  const serviceKinds = new Set(assets.map((a) => a.kind));
  const diverse = serviceKinds.size;
  if (diverse <= 6 && shadow === 0) {
    components.push({
      code: "contained",
      label: "No unexpected public service diversity detected",
      impact: WEIGHTS.containedMitigation,
      detail: "The observable surface is contained and consistent with a managed footprint.",
    });
  }

  const total = components.reduce((sum, c) => sum + c.impact, 0);
  const value = Math.max(0, Math.min(100, Math.round(100 + total)));

  const band: ExposureScore["band"] =
    value >= 80 ? "guarded" : value >= 60 ? "moderate" : value >= 40 ? "elevated" : "exposed";

  const explanation =
    `The score starts at 100 and applies transparent penalties and mitigations for what is observable from the outside. ` +
    `This value (${value}) reflects how contained and well-managed the external surface appears — it is not a probability of compromise.`;

  return { value, band, components, explanation };
}
