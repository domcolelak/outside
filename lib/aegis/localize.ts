import type { Translator, MessageKey } from "@/lib/i18n/messages";
import type { ScanResult } from "@/lib/types";
import { findingText } from "@/lib/report/finding-text";
import type { ExposureAssessment, ExposureIncident } from "./investigation";
import type { Recommendation } from "./types";

type FindingKey = MessageKey<"finding">;

export function localizeAegisRecommendation(rec: Recommendation, result: ScanResult, tr: Translator) {
  const asset = result.graph.assets.find((item) => rec.assetIds.includes(item.id));
  const label = asset?.label ?? result.target;
  const missing = Array.isArray(asset?.attrs.missingHeaders) ? (asset.attrs.missingHeaders as string[]).join(", ") : "";
  const days = typeof asset?.attrs.certDaysToExpiry === "number" ? asset.attrs.certDaysToExpiry : 0;
  let base: string;
  switch (rec.category) {
    case "mail_security": base = "mailSecurity"; break;
    case "security_headers": base = "missingHeaders"; break;
    case "certificate_lifecycle": base = days < 0 ? "certExpired" : "certExpiring"; break;
    case "non_production_exposure": base = "nonProdExposure"; break;
    case "shadow_asset": base = "shadowAsset"; break;
    case "auth_surface": base = "authSurface"; break;
    case "surface_change": base = "newAsset"; break;
    default: base = "thirdPartyReview";
  }
  const values = { label, count: rec.assetIds.length, missing, days: Math.max(0, days), notAfter: "" };
  const render = (suffix: "Title" | "Observation" | "Concern" | "Recommendation") => {
    const key = `${base}${suffix}`;
    const namespace = base === "thirdPartyReview" ? "ui" : "finding";
    return tr.t(namespace, key as never, values);
  };
  return {
    title: render("Title"),
    why: render("Observation"),
    businessImpact: render("Concern"),
    remediation: {
      summary: render("Recommendation"),
      steps: [
        tr.t("ui", "remediationReviewEvidence"),
        tr.t("ui", "remediationConfirmScope"),
        tr.t("ui", "remediationApplyControlled"),
        tr.t("ui", "remediationVerifyMonitor"),
      ],
      rollback: tr.t("ui", rec.remediation.changesInfrastructure ? "remediationRollbackChange" : "remediationRollbackAdvisory"),
    },
  };
}

export function localizeInvestigationIncident(incident: ExposureIncident, result: ScanResult, tr: Translator) {
  const asset = result.graph.assets.find((item) => incident.assetIds.includes(item.id));
  const chain = incident.findingIds.flatMap((id) => {
    const finding = result.findings.find((item) => item.id === id);
    if (!finding) return [];
    const label = result.graph.assets.find((item) => item.id === finding.assetId)?.label ?? result.target;
    return [tr.t("ui", "investigationChainItem", { asset: label, finding: findingText(finding, tr.locale).title })];
  });
  return {
    title: tr.t("ui", "investigationIncidentTitle", { asset: asset?.label ?? result.target }),
    summary: tr.t("ui", "investigationIncidentSummary", { findings: incident.findingIds.length, assets: incident.assetIds.length }),
    chain,
  };
}

export function localizeInvestigationAssessment(assessment: ExposureAssessment, incident: ExposureIncident, result: ScanResult, tr: Translator) {
  const findings = incident.findingIds.flatMap((id) => result.findings.find((item) => item.id === id) ?? []);
  const assets = incident.assetIds.flatMap((id) => result.graph.assets.find((item) => item.id === id) ?? []);
  const lead = findings[0] ? findingText(findings[0], tr.locale).title : tr.t("ui", "investigationExposure");
  const contradicting: string[] = [];
  if (assets.some((item) => item.attrs.cdn && item.attrs.cdn !== "none")) contradicting.push(tr.t("ui", "investigationCounterCdn"));
  const lowConfidence = assets.find((item) => item.orgConfidence < 0.9);
  if (lowConfidence) contradicting.push(tr.t("ui", "investigationCounterAttribution", { asset: lowConfidence.label, confidence: Math.round(lowConfidence.orgConfidence * 100) }));
  if (findings.some((item) => item.confidence < 0.8 || item.inference)) contradicting.push(tr.t("ui", "investigationCounterInference"));
  contradicting.push(tr.t("ui", "investigationCounterExternal"));
  return {
    hypothesis: tr.t("ui", "investigationHypothesis", { findings: findings.length, assets: incident.assetIds.length, lead }),
    contradicting,
  };
}
