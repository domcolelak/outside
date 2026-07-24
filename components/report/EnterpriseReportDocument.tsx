import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { EnterpriseReportData } from "@/lib/enterprise/reporting";
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
}: {
  report: EnterpriseReportData;
}) {
  return (
    <Document
      title={`OUTSIDE enterprise ${report.kind} report`}
      author="OUTSIDE"
    >
      <Page size="A4" style={s.page} wrap>
        <View style={s.band} fixed>
          <View>
            <Text style={s.brand}>OUTSIDE</Text>
            <Text style={{ fontSize: 8, marginTop: 4, color: "#83a096" }}>
              ENTERPRISE INTELLIGENCE
            </Text>
          </View>
          <Text>{new Date(report.generatedAt).toLocaleDateString()}</Text>
        </View>
        <View style={s.body}>
          <Text style={s.title}>
            {report.kind === "compliance"
              ? "Compliance evidence export"
              : report.kind === "audit"
                ? "Immutable audit export"
                : "Executive security brief"}
          </Text>
          <Text style={s.muted}>
            Organization {report.organizationId} · Region{" "}
            {report.dataRegion.toUpperCase()}
          </Text>
          <View style={s.stats}>
            <View style={s.stat}>
              <Text style={s.value}>{report.summary.posture ?? "—"}</Text>
              <Text style={s.label}>Protection posture</Text>
            </View>
            <View style={s.stat}>
              <Text style={s.value}>{report.summary.assets}</Text>
              <Text style={s.label}>Public assets</Text>
            </View>
            <View style={s.stat}>
              <Text style={s.value}>
                {report.summary.criticalRecommendations}
              </Text>
              <Text style={s.label}>Priority reviews</Text>
            </View>
            <View style={s.stat}>
              <Text style={s.value}>{report.summary.integrations}</Text>
              <Text style={s.label}>Integrations</Text>
            </View>
          </View>
          <Text style={s.h2}>Control evidence</Text>
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
                  {item.status.replace("_", " ").toUpperCase()}
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
          <Text style={s.h2}>Priority review items</Text>
          {report.recommendations.slice(0, 12).map((item) => (
            <View key={item.id} style={s.row} wrap={false}>
              <View style={s.rowHead}>
                <Text style={s.bold}>{item.title}</Text>
                <Text>{item.priority.toUpperCase()}</Text>
              </View>
              <Text style={s.note}>{item.why}</Text>
              <Text style={s.note}>
                Assets: {item.affectedAssets.join(", ") || "organization-level"}
              </Text>
            </View>
          ))}
          <Text style={s.h2}>Integrity</Text>
          <Text style={s.note}>
            Audit chain:{" "}
            {report.auditIntegrity.valid ? "verified" : "verification failed"} ·{" "}
            {report.auditIntegrity.checked} event(s) checked · head{" "}
            {report.auditIntegrity.head ?? "GENESIS"}
          </Text>
          <Text style={s.note}>{report.disclaimer}</Text>
        </View>
        <View style={s.footer} fixed>
          <Text>OUTSIDE · deterministic external-surface intelligence</Text>
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
