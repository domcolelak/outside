import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { AgencyReport } from "@/lib/agency/types";
import type { GuardianEvent } from "@/lib/guardian/types";
import { localizeGuardianEvent } from "@/lib/guardian/localize";
import { getTranslator } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/locales";

const styles = StyleSheet.create({ page: { fontFamily: "Helvetica", color: "#101722", fontSize: 9, paddingBottom: 40 }, band: { backgroundColor: "#080d14", color: "#edf4ff", padding: 30, flexDirection: "row", justifyContent: "space-between" }, brand: { fontFamily: "Helvetica-Bold", fontSize: 15, letterSpacing: 2 }, sub: { marginTop: 4, color: "#91a0b8", fontSize: 8, letterSpacing: 1 }, body: { padding: 30 }, title: { fontFamily: "Helvetica-Bold", fontSize: 23 }, muted: { color: "#708096", marginTop: 5 }, stats: { flexDirection: "row", gap: 8, marginTop: 20 }, stat: { flex: 1, border: "1 solid #dfe6ef", borderRadius: 6, padding: 10 }, value: { fontFamily: "Helvetica-Bold", fontSize: 18 }, label: { color: "#708096", fontSize: 7, textTransform: "uppercase", marginTop: 3 }, heading: { fontFamily: "Helvetica-Bold", fontSize: 10, color: "#435269", textTransform: "uppercase", letterSpacing: 1, marginTop: 22, marginBottom: 8 }, item: { border: "1 solid #dfe6ef", borderRadius: 6, padding: 10, marginBottom: 7 }, itemTitle: { fontFamily: "Helvetica-Bold", fontSize: 10 }, itemText: { color: "#435269", lineHeight: 1.4, marginTop: 4 }, footer: { position: "absolute", bottom: 16, left: 30, right: 30, borderTop: "1 solid #dfe6ef", paddingTop: 5, color: "#8190a4", fontSize: 7, flexDirection: "row", justifyContent: "space-between" } });
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;
const text = (value: unknown) => typeof value === "string" ? value.slice(0, 2000) : "";
const events = (value: unknown) => Array.isArray(value) ? value.slice(0, 30) as GuardianEvent[] : [];

export function AgencyReportDocument({ report, locale }: { report: AgencyReport; locale: Locale }) {
  const tr = getTranslator(locale);
  const content = report.content;
  const changes = events(content.recentChanges);
  const client = text(content.client);
  const brand = report.branding.whiteLabel ? report.branding.emailFromName || tr.t("agency", "reportSecurityOperations") : tr.t("agency", "reportOutsideAgency");
  const kindKey = `reportKind${report.kind[0]!.toUpperCase()}${report.kind.slice(1)}` as Parameters<typeof tr.t<"agency">>[1];
  const titleKey = `reportTitle${report.kind[0]!.toUpperCase()}${report.kind.slice(1)}` as Parameters<typeof tr.t<"agency">>[1];
  const title = tr.t("agency", titleKey, { client });
  const stats: Array<[unknown, Parameters<typeof tr.t<"agency">>[1]]> = [[content.assets, "reportObservedAssets"], [content.openRecommendations, "reportOpenReviews"], [content.critical, "reportCritical"], [content.targets, "reportTargets"]];
  return <Document title={title} author={brand}><Page size="A4" style={styles.page} wrap>
    <View style={{ ...styles.band, borderBottom: `4 solid ${report.branding.primaryColor}` }} fixed><View><Text style={styles.brand}>{brand}</Text><Text style={styles.sub}>{tr.t("agency", kindKey)}</Text></View><Text>{tr.formatDate(report.periodEnd)}</Text></View>
    <View style={styles.body}><Text style={styles.title}>{title}</Text><Text style={styles.muted}>{client} · {tr.formatDate(report.periodStart)} – {tr.formatDate(report.periodEnd)}</Text>
      <View style={styles.stats}>{stats.map(([value, key]) => <View key={key} style={styles.stat}><Text style={styles.value}>{number(value)}</Text><Text style={styles.label}>{tr.t("agency", key)}</Text></View>)}</View>
      <Text style={styles.heading}>{tr.t("agency", "reportExecutiveOverview")}</Text><Text style={styles.itemText}>{tr.t("agency", report.branding.whiteLabel ? "reportOverviewWhiteLabel" : "reportOverviewOutside")}</Text>
      <Text style={styles.heading}>{tr.t("agency", "reportImportantChanges")}</Text>{changes.map((change, index) => { const copy = localizeGuardianEvent(change, tr); return <View key={`${change.id}-${index}`} style={styles.item} wrap={false}><Text style={styles.itemTitle}>{copy.title}</Text><Text style={styles.itemText}>{copy.summary}</Text><Text style={{ ...styles.itemText, color: report.branding.primaryColor }}>{tr.t("ui", `priority${change.severity[0]!.toUpperCase()}${change.severity.slice(1)}` as Parameters<typeof tr.t<"ui">>[1])}</Text></View>; })}{!changes.length && <Text style={styles.itemText}>{tr.t("agency", "reportNoChanges")}</Text>}
    </View><View style={styles.footer} fixed><Text>{report.branding.emailFooter || tr.t("agency", "reportFooterDefault")}</Text><Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} /></View>
  </Page></Document>;
}
