import { getGuardianStore } from "@/lib/guardian/store";
import { localizeGuardianRecommendation } from "@/lib/guardian/localize";
import { csvCell } from "@/lib/export/csv";
import type { GuardianOverview } from "@/lib/guardian/types";
import { getTranslator, type Translator } from "@/lib/i18n/messages";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import { verifyAuditChain } from "./audit";
import type { EnterpriseAuditEvent, EnterpriseOverview } from "./types";

export interface ComplianceControl { id: string; framework: string; title: string; status: "evidenced" | "partial" | "not_evidenced"; evidence: string[]; note: string; }
export interface EnterpriseReportData { schema: "com.outside.enterprise.report/v1"; kind: "executive" | "compliance" | "audit"; generatedAt: string; organizationId: string; dataRegion: string; summary: { posture: number | null; assets: number; criticalRecommendations: number; identityProviders: number; integrations: number; pendingApprovals: number; riskExceptions: number }; recommendations: Array<{ id: string; title: string; priority: string; why: string; affectedAssets: string[] }>; controls: ComplianceControl[]; auditIntegrity: ReturnType<typeof verifyAuditChain>; audit: EnterpriseAuditEvent[]; disclaimer: string; }

const controls = (overview: EnterpriseOverview, guardian: GuardianOverview, audit: EnterpriseAuditEvent[], tr: Translator): ComplianceControl[] => {
  const providers = overview.identityProviders.filter((item) => item.enabled);
  const hasSso = providers.length > 0;
  const hasScim = overview.identityProviders.some((item) => item.scimTokenPrefix);
  const auditOk = verifyAuditChain(audit).valid;
  const enabledIntegrations = overview.integrations.filter((item) => item.enabled).length;
  const hasIntegrations = enabledIntegrations > 0;
  const retention = Number(overview.workspace.retention.auditDays ?? 0);
  return [
    { id: "CC6.1", framework: "SOC 2", title: tr.t("enterprise", "controlLogicalAccess"), status: hasSso ? "evidenced" : "partial", evidence: providers.map((item) => tr.t("enterprise", "controlEvidenceProvider", { protocol: item.protocol.toUpperCase(), name: item.name })), note: tr.t("enterprise", "controlNoteConfiguration") },
    { id: "A.5.16", framework: "ISO 27001", title: tr.t("enterprise", "controlIdentityManagement"), status: hasScim ? "evidenced" : hasSso ? "partial" : "not_evidenced", evidence: hasScim ? [tr.t("enterprise", "controlEvidenceScim")] : [], note: tr.t("enterprise", "controlNoteNoCertification") },
    { id: "CC7.2", framework: "SOC 2", title: tr.t("enterprise", "controlSecurityMonitoring"), status: guardian.targets.length && hasIntegrations ? "evidenced" : guardian.targets.length ? "partial" : "not_evidenced", evidence: [tr.t("enterprise", "controlEvidenceTargets", { count: guardian.targets.length }), tr.t("enterprise", "controlEvidenceIntegrations", { count: enabledIntegrations })], note: tr.t("enterprise", "controlNoteMonitoring") },
    { id: "A.8.15", framework: "ISO 27001", title: tr.t("enterprise", "controlLogging"), status: auditOk && retention >= 365 ? "evidenced" : auditOk ? "partial" : "not_evidenced", evidence: auditOk ? [tr.t("enterprise", "controlEvidenceHash", { count: audit.length }), tr.t("enterprise", "controlEvidenceRetention", { days: retention || tr.t("enterprise", "platformMinimum") })] : [], note: tr.t("enterprise", "controlNoteHash") },
    { id: "NIS2-21.2", framework: "NIS2", title: tr.t("enterprise", "controlRiskIncident"), status: guardian.recommendations.length ? "evidenced" : "partial", evidence: [tr.t("enterprise", "controlEvidenceRecommendations", { count: guardian.recommendations.length }), tr.t("enterprise", "controlEvidenceApprovals", { count: overview.pendingApprovals.length })], note: tr.t("enterprise", "controlNoteReview") },
    { id: "DORA-10", framework: "DORA", title: tr.t("enterprise", "controlDetectionResponse"), status: hasIntegrations && guardian.recentEvents.length ? "evidenced" : "partial", evidence: [tr.t("enterprise", "controlEvidenceChanges", { count: guardian.recentEvents.length })], note: tr.t("enterprise", "controlNoteExternalInput") },
  ];
};

export async function buildEnterpriseReport(overview: EnterpriseOverview, audit: EnterpriseAuditEvent[], kind: EnterpriseReportData["kind"], locale: Locale = DEFAULT_LOCALE): Promise<EnterpriseReportData> {
  const tr = getTranslator(locale);
  const guardian = await getGuardianStore().then((store) => store.overview(overview.workspace.orgId));
  const latest = guardian.targets.map((item) => item.latest.exposureScore);
  const recommendations = guardian.recommendations.filter((item) => item.status === "open");
  return {
    schema: "com.outside.enterprise.report/v1",
    kind,
    generatedAt: new Date().toISOString(),
    organizationId: overview.workspace.orgId,
    dataRegion: overview.workspace.dataRegion,
    summary: { posture: latest.length ? Math.round(latest.reduce((sum, value) => sum + value, 0) / latest.length) : null, assets: guardian.targets.reduce((sum, item) => sum + item.latest.metrics.assets, 0), criticalRecommendations: recommendations.filter((item) => ["critical", "high"].includes(item.priority)).length, identityProviders: overview.identityProviders.filter((item) => item.enabled).length, integrations: overview.integrations.filter((item) => item.enabled).length, pendingApprovals: overview.pendingApprovals.length, riskExceptions: overview.expiringExceptions.length },
    recommendations: recommendations.slice(0, 100).map((item) => { const copy = localizeGuardianRecommendation(item, tr); return { id: item.id, title: copy.title, priority: item.priority, why: copy.why, affectedAssets: item.affectedAssets }; }),
    controls: controls(overview, guardian, audit, tr),
    auditIntegrity: verifyAuditChain(audit),
    audit: kind === "audit" ? audit : audit.slice(-25),
    disclaimer: tr.t("enterprise", "reportDisclaimer"),
  };
}

export function reportCsv(report: EnterpriseReportData, locale: Locale): string {
  const tr = getTranslator(locale);
  const headers = ["CsvFramework", "CsvControl", "CsvTitle", "CsvStatus", "CsvEvidence", "CsvNote"].map((key) => tr.t("enterprise", `report${key}` as Parameters<typeof tr.t<"enterprise">>[1]));
  return [headers.map(csvCell).join(","), ...report.controls.map((item) => [item.framework, item.id, item.title, tr.t("enterprise", `reportStatus${item.status === "not_evidenced" ? "NotEvidenced" : item.status[0]!.toUpperCase() + item.status.slice(1)}` as Parameters<typeof tr.t<"enterprise">>[1]), item.evidence.join("; "), item.note].map(csvCell).join(","))].join("\r\n");
}
