/**
 * Printable external-surface report, rendered server-side with @react-pdf.
 * Light theme for print, with a dark brand band. All content derives from the
 * ScanResult; demo reports are watermarked as synthetic.
 */

import { Document, Page, View, Text, Svg, Circle, StyleSheet } from "@react-pdf/renderer";
import type { ScanResult } from "@/lib/types";
import { buildExecutiveSummary } from "@/lib/report/summary";

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
const PRIORITY_COLOR: Record<string, string> = {
  critical: "#c02e3c",
  high: "#c85a2b",
  medium: "#b8860b",
  low: "#3355c9",
  info: "#0f8f7a",
};

const s = StyleSheet.create({
  page: { paddingTop: 0, paddingBottom: 48, paddingHorizontal: 0, fontSize: 10, color: INK, fontFamily: "Helvetica" },
  band: { backgroundColor: "#080b11", paddingVertical: 22, paddingHorizontal: 40, color: "#e8edf6", flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  brand: { fontSize: 15, letterSpacing: 3, fontFamily: "Helvetica-Bold", color: "#e8edf6" },
  bandSub: { fontSize: 8, color: "#8791a3", letterSpacing: 1, marginTop: 3 },
  body: { paddingHorizontal: 40, paddingTop: 22 },
  h2: { fontSize: 11, fontFamily: "Helvetica-Bold", letterSpacing: 1, textTransform: "uppercase", color: SOFT, marginBottom: 8, marginTop: 18 },
  coverRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  org: { fontSize: 22, fontFamily: "Helvetica-Bold", color: INK },
  meta: { fontSize: 9, color: FAINT, marginTop: 2 },
  scoreLabel: { fontSize: 8, color: FAINT, textTransform: "uppercase", letterSpacing: 1, textAlign: "center" },
  statRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  stat: { flex: 1, border: `1 solid ${LINE}`, borderRadius: 6, padding: 10 },
  statVal: { fontSize: 18, fontFamily: "Helvetica-Bold", color: INK },
  statLabel: { fontSize: 7, color: FAINT, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 },
  summary: { fontSize: 10.5, lineHeight: 1.5, color: "#2a3345" },
  finding: { border: `1 solid ${LINE}`, borderRadius: 6, padding: 10, marginBottom: 8 },
  findingHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  findingTitle: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: INK },
  tag: { fontSize: 7, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.5 },
  label7: { fontSize: 7, color: FAINT, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4 },
  fieldText: { fontSize: 9, color: "#2a3345", lineHeight: 1.4 },
  row: { flexDirection: "row", justifyContent: "space-between", borderBottom: `1 solid ${LINE}`, paddingVertical: 4 },
  footer: { position: "absolute", bottom: 20, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: FAINT, borderTop: `1 solid ${LINE}`, paddingTop: 6 },
  watermark: { backgroundColor: "#fff4e6", color: "#c85a2b", fontSize: 8, fontFamily: "Helvetica-Bold", paddingVertical: 4, paddingHorizontal: 40, letterSpacing: 1 },
});

function ScoreRing({ value, color }: { value: number; color: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const filled = (c * value) / 100;
  return (
    <View style={{ alignItems: "center" }}>
      <Svg width={88} height={88} viewBox="0 0 88 88">
        <Circle cx="44" cy="44" r={r} stroke={LINE} strokeWidth={7} fill="none" />
        <Circle cx="44" cy="44" r={r} stroke={color} strokeWidth={7} fill="none" strokeLinecap="round" strokeDasharray={`${filled.toFixed(2)},${(c - filled).toFixed(2)}`} transform="rotate(-90 44 44)" />
      </Svg>
      <Text style={{ marginTop: -56, fontSize: 22, fontFamily: "Helvetica-Bold", color: INK }}>{value}</Text>
      <Text style={{ marginTop: 30, ...s.scoreLabel }}>/ 100 · {value >= 80 ? "Guarded" : value >= 60 ? "Moderate" : value >= 40 ? "Elevated" : "Exposed"}</Text>
    </View>
  );
}

export function ReportDocument({ result }: { result: ScanResult }) {
  const date = new Date(result.finishedAt).toLocaleString();
  const bandColor = BAND_COLOR[result.score.band] ?? SIGNAL;
  const topFindings = result.findings.slice(0, 8);
  const assets = result.graph.assets.filter((a) => a.kind !== "root_domain");

  return (
    <Document title={`OUTSIDE external surface — ${result.target}`} author="OUTSIDE">
      <Page size="A4" style={s.page} wrap>
        <View style={s.band} fixed>
          <View>
            <Text style={s.brand}>OUTSIDE</Text>
            <Text style={s.bandSub}>EXTERNAL SURFACE REPORT</Text>
          </View>
          <Text style={{ fontSize: 8, color: "#8791a3" }}>{date}</Text>
        </View>

        {result.isDemo && <Text style={s.watermark}>DEMO DATASET — synthetic organization. Illustrative, not a real scan.</Text>}

        <View style={s.body}>
          <View style={s.coverRow}>
            <View>
              <Text style={s.org}>{result.target}</Text>
              <Text style={s.meta}>
                {result.mode === "demo" ? "Demo view" : "Passive external view (unverified)"} · Scan {result.scanId}
              </Text>
            </View>
            <ScoreRing value={result.score.value} color={bandColor} />
          </View>

          <View style={s.statRow}>
            <Stat v={result.stats.assets} l="External assets" />
            <Stat v={result.stats.webSurfaces} l="Web / API surfaces" />
            <Stat v={result.stats.shadowAssets} l="Shadow signals" warn={result.stats.shadowAssets > 0} />
            <Stat v={result.stats.highPriorityFindings} l="High priority" warn={result.stats.highPriorityFindings > 0} />
          </View>

          <Text style={s.h2}>Executive summary</Text>
          <Text style={s.summary}>{buildExecutiveSummary(result)}</Text>

          <Text style={s.h2}>Exposure score breakdown</Text>
          {result.score.components.map((comp) => (
            <View key={comp.code} style={s.row}>
              <Text style={{ fontSize: 9, color: "#2a3345", flex: 1 }}>{comp.label}</Text>
              <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: comp.impact < 0 ? PRIORITY_COLOR.high : SIGNAL }}>
                {comp.impact > 0 ? "+" : ""}
                {comp.impact}
              </Text>
            </View>
          ))}

          {result.changeSummary && result.changeSummary.events.length > 0 && (
            <>
              <Text style={s.h2}>Changes since last scan</Text>
              {result.changeSummary.events.map((e, i) => (
                <View key={i} style={s.row}>
                  <Text style={{ fontSize: 9, color: "#2a3345", flex: 1 }}>{e.label}</Text>
                  <Text style={{ fontSize: 8, color: FAINT }}>{e.type.replace(/_/g, " ")}</Text>
                </View>
              ))}
            </>
          )}

          <Text style={s.h2} break={topFindings.length > 3}>Findings ({result.findings.length})</Text>
          {topFindings.map((f) => (
            <View key={f.id} style={s.finding} wrap={false}>
              <View style={s.findingHead}>
                <Text style={s.findingTitle}>{f.title}</Text>
                <Text style={{ ...s.tag, color: PRIORITY_COLOR[f.priority] }}>
                  {f.priority} · {Math.round(f.confidence * 100)}%
                </Text>
              </View>
              <Text style={{ fontSize: 9, color: INK }}>{f.assetId && assets.find((a) => a.id === f.assetId)?.label}</Text>
              <Text style={s.label7}>Observed</Text>
              <Text style={s.fieldText}>{f.observation}</Text>
              {f.inference && (
                <>
                  <Text style={s.label7}>Inferred</Text>
                  <Text style={s.fieldText}>{f.inference}</Text>
                </>
              )}
              <Text style={s.label7}>Possible concern</Text>
              <Text style={s.fieldText}>{f.concern}</Text>
              <Text style={s.label7}>Recommended review</Text>
              <Text style={s.fieldText}>{f.recommendation}</Text>
            </View>
          ))}

          <Text style={s.h2} break>Asset inventory</Text>
          {assets.map((a) => (
            <View key={a.id} style={s.row}>
              <Text style={{ fontSize: 9, color: "#2a3345", flex: 2 }}>{a.label}</Text>
              <Text style={{ fontSize: 8, color: FAINT, flex: 1 }}>{a.kind.replace(/_/g, " ")}</Text>
              <Text style={{ fontSize: 8, color: PRIORITY_COLOR[a.priority], flex: 1, textAlign: "right" }}>{a.priority}</Text>
            </View>
          ))}

          <Text style={s.h2}>Methodology & responsible use</Text>
          <Text style={s.fieldText}>
            OUTSIDE maps an organization&apos;s publicly observable digital footprint using passive, non-invasive public sources
            (certificate transparency and DNS). Findings separate observed fact from inference from possible concern, each with a
            confidence score. This report describes external discovery only — it does not represent exploitation, compromise, or
            unauthorized access. Items marked as inferred or possible require human review before action.
          </Text>
        </View>

        <View style={s.footer} fixed>
          <Text>OUTSIDE · External surface report · {result.target}</Text>
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
