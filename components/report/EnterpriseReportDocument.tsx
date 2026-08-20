import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { EnterpriseReportData } from "@/lib/enterprise/reporting";
import type { Locale } from "@/lib/i18n/locales";
import { getTranslator } from "@/lib/i18n/messages";
const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#121923",
    paddingBottom: 44,
  },
  band: {
    backgroundColor: "#07110e",
    color: "#eefaf5",
    padding: 28,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  brand: { fontFamily: "Helvetica-Bold", fontSize: 16, letterSpacing: 3 },
  body: { paddingHorizontal: 34, paddingTop: 22 },
  title: { fontFamily: "Helvetica-Bold", fontSize: 22 },
  muted: { color: "#697586", marginTop: 4 },
  stats: { flexDirection: "row", gap: 8, marginTop: 18 },
  stat: { flex: 1, border: "1 solid #dde4e0", borderRadius: 6, padding: 10 },
  value: { fontFamily: "Helvetica-Bold", fontSize: 16 },
  label: {
    color: "#77847e",
    fontSize: 7,
    textTransform: "uppercase",
    marginTop: 2,
  },
  h2: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#405049",
    marginTop: 20,
    marginBottom: 8,
  },
  row: {
    border: "1 solid #dde4e0",
    borderRadius: 5,
    padding: 9,
    marginBottom: 6,
  },
  rowHead: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  bold: { fontFamily: "Helvetica-Bold" },
  good: { color: "#08765f" },
  warn: { color: "#a36b00" },
  bad: { color: "#b33a42" },
  note: { color: "#5d6974", lineHeight: 1.4, marginTop: 4 },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 34,
    right: 34,
    borderTop: "1 solid #dde4e0",
    paddingTop: 5,
    color: "#87918c",
    fontSize: 7,
    flexDirection: "row",
    justifyContent: "space-between",
  },
});
export function EnterpriseReportDocument({
  report,
  locale,
}: {
  report: EnterpriseReportData;
  locale: Locale;
}) {
  const tr = getTranslator(locale);
  const title = tr.t("enterprise", `reportTitle${report.kind[0]!.toUpperCase()}${report.kind.slice(1)}` as Parameters<typeof tr.t<"enterprise">>[1]);
  return (
    <Document
      title={title}
      author="OUTSIDE"
    >
      <Page size="A4" style={s.page} wrap>
        <View style={s.band} fixed>
          <View>
            <Text style={s.brand}>OUTSIDE</Text>
            <Text style={{ fontSize: 8, marginTop: 4, color: "#83a096" }}>
              {tr.t("enterprise", "reportIntelligence")}
            </Text>
          </View>
          <Text>{tr.formatDate(report.generatedAt)}</Text>
        </View>
        <View style={s.body}>
          <Text style={s.title}>
            {title}
          </Text>
          <Text style={s.muted}>
            {tr.t("enterprise", "reportOrganizationRegion", { organization: report.organizationId, region: report.dataRegion.toUpperCase() })}
          </Text>
          <View style={s.stats}>
            <View style={s.stat}>
              <Text style={s.value}>{report.summary.posture ?? "—"}</Text>
              <Text style={s.label}>{tr.t("enterprise", "reportProtectionPosture")}</Text>
            </View>
            <View style={s.stat}>
              <Text style={s.value}>{report.summary.assets}</Text>
              <Text style={s.label}>{tr.t("enterprise", "reportPublicAssets")}</Text>
            </View>
            <View style={s.stat}>
              <Text style={s.value}>
                {report.summary.criticalRecommendations}
              </Text>
              <Text style={s.label}>{tr.t("enterprise", "reportPriorityReviews")}</Text>
            </View>
            <View style={s.stat}>
              <Text style={s.value}>{report.summary.integrations}</Text>
              <Text style={s.label}>{tr.t("enterprise", "reportIntegrations")}</Text>
            </View>
          </View>
          <Text style={s.h2}>{tr.t("enterprise", "reportControlEvidence")}</Text>
          {report.controls.map((item) => (
            <View
              key={`${item.framework}:${item.id}`}
              style={s.row}
              wrap={false}
            >
              <View style={s.rowHead}>
                <Text style={s.bold}>
                  {item.framework} · {item.id} · {item.title}
                </Text>
                <Text
                  style={
                    item.status === "evidenced"
                      ? s.good
                      : item.status === "partial"
                        ? s.warn
                        : s.bad
                  }
                >
                  {tr.t("enterprise", `reportStatus${item.status === "not_evidenced" ? "NotEvidenced" : item.status[0]!.toUpperCase() + item.status.slice(1)}` as Parameters<typeof tr.t<"enterprise">>[1])}
                </Text>
              </View>
              {item.evidence.map((line) => (
                <Text key={line} style={s.note}>
                  • {line}
                </Text>
              ))}
              <Text style={s.note}>{item.note}</Text>
            </View>
          ))}
          <Text style={s.h2}>{tr.t("enterprise", "reportPriorityItems")}</Text>
          {report.recommendations.slice(0, 12).map((item) => (
            <View key={item.id} style={s.row} wrap={false}>
              <View style={s.rowHead}>
                <Text style={s.bold}>{item.title}</Text>
                <Text>{tr.t("ui", `priority${item.priority[0]!.toUpperCase()}${item.priority.slice(1)}` as Parameters<typeof tr.t<"ui">>[1])}</Text>
              </View>
              <Text style={s.note}>{item.why}</Text>
              <Text style={s.note}>
                {tr.t("enterprise", "reportAssetsLine", { assets: item.affectedAssets.join(", ") || tr.t("enterprise", "reportOrganizationLevel") })}
              </Text>
            </View>
          ))}
          <Text style={s.h2}>{tr.t("enterprise", "reportIntegrity")}</Text>
          <Text style={s.note}>
            {tr.t("enterprise", "reportAuditChain", { status: tr.t("enterprise", report.auditIntegrity.valid ? "reportVerified" : "reportVerificationFailed"), count: report.auditIntegrity.checked, head: report.auditIntegrity.head ?? "GENESIS" })}
          </Text>
          <Text style={s.note}>{report.disclaimer}</Text>
        </View>
        <View style={s.footer} fixed>
          <Text>{tr.t("enterprise", "reportFooter")}</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
