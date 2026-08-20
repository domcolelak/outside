/**
 * Printable external-surface report, rendered server-side with @react-pdf.
 * Light theme for print, with a dark brand band. All content derives from the
 * ScanResult; demo reports are watermarked as synthetic.
 */

import { Document, Page, View, Text, Svg, Circle, StyleSheet } from "@react-pdf/renderer";
import type { ScanResult } from "@/lib/types";
import { buildExecutiveSummary } from "@/lib/report/summary";
import { reportFontFamily, reportLocale } from "@/lib/report/fonts";
import { findingText } from "@/lib/report/finding-text";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import { getTranslator, type MessageKey } from "@/lib/i18n/messages";
import { localizeChangeType, localizeScoreComponent } from "@/lib/report/scan-copy";

// Resolved once at module load: the bundled font when it is present and has the
// coverage these languages need, the base-14 fallback when it is not.
const REGULAR = reportFontFamily();
const BOLD = reportFontFamily(true);

const INK = "#0b0f17";
const SOFT = "#4b5568";
const FAINT = "#8791a3";
const LINE = "#e3e7ee";
const SIGNAL = "#0f8f7a";

const BAND_COLOR: Record<string, string> = {
  guarded: "#0f8f7a",
  moderate: "#3355c9",
  elevated: "#b8860b",
  exposed: "#c85a2b",
};
/** The posture band's name, keyed so it reads in the report's own language. */
const BAND_KEYS = {
  guarded: "bandGuarded",
  moderate: "bandModerate",
  elevated: "bandElevated",
  exposed: "bandExposed",
} as const satisfies Record<string, MessageKey<"report">>;

const PRIORITY_COLOR: Record<string, string> = {
  critical: "#c02e3c",
  high: "#c85a2b",
  medium: "#b8860b",
  low: "#3355c9",
  info: "#0f8f7a",
};

const s = StyleSheet.create({
  page: { paddingTop: 0, paddingBottom: 48, paddingHorizontal: 0, fontSize: 10, color: INK, fontFamily: REGULAR },
  band: { backgroundColor: "#080b11", paddingVertical: 22, paddingHorizontal: 40, color: "#e8edf6", flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  brand: { fontSize: 15, letterSpacing: 3, fontFamily: BOLD, color: "#e8edf6" },
  bandSub: { fontSize: 8, color: "#8791a3", letterSpacing: 1, marginTop: 3 },
  body: { paddingHorizontal: 40, paddingTop: 22 },
  h2: { fontSize: 11, fontFamily: BOLD, letterSpacing: 1, textTransform: "uppercase", color: SOFT, marginBottom: 8, marginTop: 18 },
  coverRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  org: { fontSize: 22, fontFamily: BOLD, color: INK },
  meta: { fontSize: 9, color: FAINT, marginTop: 2 },
  scoreLabel: { fontSize: 8, color: FAINT, textTransform: "uppercase", letterSpacing: 1, textAlign: "center" },
  statRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  stat: { flex: 1, border: `1 solid ${LINE}`, borderRadius: 6, padding: 10 },
  statVal: { fontSize: 18, fontFamily: BOLD, color: INK },
  statLabel: { fontSize: 7, color: FAINT, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 },
  summary: { fontSize: 10.5, lineHeight: 1.5, color: "#2a3345" },
  finding: { border: `1 solid ${LINE}`, borderRadius: 6, padding: 10, marginBottom: 8 },
  findingHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  findingTitle: { fontSize: 10.5, fontFamily: BOLD, color: INK },
  tag: { fontSize: 7, fontFamily: BOLD, textTransform: "uppercase", letterSpacing: 0.5 },
  label7: { fontSize: 7, color: FAINT, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4 },
  fieldText: { fontSize: 9, color: "#2a3345", lineHeight: 1.4 },
  row: { flexDirection: "row", justifyContent: "space-between", borderBottom: `1 solid ${LINE}`, paddingVertical: 4 },
  footer: { position: "absolute", bottom: 20, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: FAINT, borderTop: `1 solid ${LINE}`, paddingTop: 6 },
  watermark: { backgroundColor: "#fff4e6", color: "#c85a2b", fontSize: 8, fontFamily: BOLD, paddingVertical: 4, paddingHorizontal: 40, letterSpacing: 1 },
});

function ScoreRing({ value, color, bandLabel }: { value: number; color: string; bandLabel: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const filled = (c * value) / 100;
  return (
    <View style={{ alignItems: "center" }}>
      <Svg width={88} height={88} viewBox="0 0 88 88">
        <Circle cx="44" cy="44" r={r} stroke={LINE} strokeWidth={7} fill="none" />
        <Circle cx="44" cy="44" r={r} stroke={color} strokeWidth={7} fill="none" strokeLinecap="round" strokeDasharray={`${filled.toFixed(2)},${(c - filled).toFixed(2)}`} transform="rotate(-90 44 44)" />
      </Svg>
      <Text style={{ marginTop: -56, fontSize: 22, fontFamily: BOLD, color: INK }}>{value}</Text>
      <Text style={{ marginTop: 30, ...s.scoreLabel }}>/ 100 · {bandLabel}</Text>
    </View>
  );
}

export function ReportDocument({ result, locale = DEFAULT_LOCALE }: { result: ScanResult; locale?: Locale }) {
  // reportLocale() answers English when no font can spell the requested
  // language, so the document never asks for words it cannot draw.
  const t = getTranslator(reportLocale(locale));
  const r = (key: Parameters<typeof t.t<"report">>[1], values?: Record<string, string | number>) => t.t("report", key, values);
  const date = t.formatDate(result.finishedAt, { dateStyle: "medium", timeStyle: "short" });
  const bandColor = BAND_COLOR[result.score.band] ?? SIGNAL;
  const topFindings = result.findings.slice(0, 8);
  const assets = result.graph.assets.filter((a) => a.kind !== "root_domain");

  return (
    <Document title={r("documentTitle", { target: result.target })} author="OUTSIDE">
      <Page size="A4" style={s.page} wrap>
        <View style={s.band} fixed>
          <View>
            <Text style={s.brand}>OUTSIDE</Text>
            <Text style={s.bandSub}>{r("bandLabel")}</Text>
          </View>
          <Text style={{ fontSize: 8, color: "#8791a3" }}>{date}</Text>
        </View>

        {result.isDemo && <Text style={s.watermark}>{r("demoWatermark")}</Text>}

        <View style={s.body}>
          <View style={s.coverRow}>
            <View>
              <Text style={s.org}>{result.target}</Text>
              <Text style={s.meta}>
                {result.mode === "demo" ? r("modeDemo") : r("modePassive")} · {r("scanReference", { scanId: result.scanId })}
              </Text>
            </View>
            <ScoreRing value={result.score.value} color={bandColor} bandLabel={r(BAND_KEYS[result.score.band] ?? "bandModerate")} />
          </View>

          <View style={s.statRow}>
            <Stat v={result.stats.assets} l={r("statAssets")} />
            <Stat v={result.stats.webSurfaces} l={r("statWebSurfaces")} />
            <Stat v={result.stats.shadowAssets} l={r("statShadow")} warn={result.stats.shadowAssets > 0} />
            <Stat v={result.stats.highPriorityFindings} l={r("statHighPriority")} warn={result.stats.highPriorityFindings > 0} />
          </View>

          <Text style={s.h2}>{r("headingSummary")}</Text>
          <Text style={s.summary}>{buildExecutiveSummary(result, t.locale)}</Text>

          <Text style={s.h2}>{r("headingPosture")}</Text>
          {result.score.components.map((comp) => (
            <View key={comp.code} style={s.row}>
              <Text style={{ fontSize: 9, color: "#2a3345", flex: 1 }}>{localizeScoreComponent(comp, result, t)}</Text>
              <Text style={{ fontSize: 9, fontFamily: BOLD, color: comp.impact < 0 ? PRIORITY_COLOR.high : SIGNAL }}>
                {comp.impact > 0 ? "+" : ""}
                {comp.impact}
              </Text>
            </View>
          ))}

          {result.changeSummary && result.changeSummary.events.length > 0 && (
            <>
              <Text style={s.h2}>{r("headingChanges")}</Text>
              {result.changeSummary.events.map((e, i) => (
                <View key={i} style={s.row}>
                  <Text style={{ fontSize: 9, color: "#2a3345", flex: 1 }}>{e.label}</Text>
                  <Text style={{ fontSize: 8, color: FAINT }}>{localizeChangeType(e, t)}</Text>
                </View>
              ))}
            </>
          )}

          <Text style={s.h2} break={topFindings.length > 3}>{r("headingFindings", { count: result.findings.length })}</Text>
          {topFindings.map((f) => {
            // Translated where the finding carries a key; its own recorded
            // English otherwise, so nothing ever renders as a bare key.
            const text = findingText(f, t.locale);
            return (
            <View key={f.id} style={s.finding} wrap={false}>
              <View style={s.findingHead}>
                <Text style={s.findingTitle}>{text.title}</Text>
                <Text style={{ ...s.tag, color: PRIORITY_COLOR[f.priority] }}>
                  {f.priority} · {Math.round(f.confidence * 100)}%
                </Text>
              </View>
              <Text style={{ fontSize: 9, color: INK }}>{f.assetId && assets.find((a) => a.id === f.assetId)?.label}</Text>
              <Text style={s.label7}>{r("labelObserved")}</Text>
              <Text style={s.fieldText}>{text.observation}</Text>
              {text.inference && (
                <>
                  <Text style={s.label7}>{r("labelInferred")}</Text>
                  <Text style={s.fieldText}>{text.inference}</Text>
                </>
              )}
              <Text style={s.label7}>{r("labelConcern")}</Text>
              <Text style={s.fieldText}>{text.concern}</Text>
              <Text style={s.label7}>{r("labelRecommendation")}</Text>
              <Text style={s.fieldText}>{text.recommendation}</Text>
            </View>
          );})}

          <Text style={s.h2} break>{r("headingInventory")}</Text>
          {assets.map((a) => (
            <View key={a.id} style={s.row}>
              <Text style={{ fontSize: 9, color: "#2a3345", flex: 2 }}>{a.label}</Text>
              <Text style={{ fontSize: 8, color: FAINT, flex: 1 }}>{a.kind.replace(/_/g, " ")}</Text>
              <Text style={{ fontSize: 8, color: PRIORITY_COLOR[a.priority], flex: 1, textAlign: "right" }}>{a.priority}</Text>
            </View>
          ))}

          <Text style={s.h2}>{r("headingMethodology")}</Text>
          <Text style={s.fieldText}>{r("methodology")}</Text>
        </View>

        <View style={s.footer} fixed>
          <Text>{r("footer", { target: result.target })}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

function Stat({ v, l, warn = false }: { v: number; l: string; warn?: boolean }) {
  return (
    <View style={s.stat}>
      <Text style={{ ...s.statVal, color: warn && v > 0 ? PRIORITY_COLOR.high : INK }}>{v}</Text>
      <Text style={s.statLabel}>{l}</Text>
    </View>
  );
}
