"use client";

import { useState } from "react";
import type { Finding, ScanResult } from "@/lib/types";
import type { ChangeSummary, ChangeType } from "@/lib/persistence/model";
import { AssuranceTag, Confidence, PriorityDot, PRIORITY_STYLE } from "@/components/ui";
import { HistoryPanel } from "@/components/panels/HistoryPanel";
import { ProtectionPanel } from "@/components/panels/ProtectionPanel";
import { InvestigationPanel } from "@/components/panels/InvestigationPanel";
import { EvidenceIntelligencePanel } from "@/components/guardian/EvidenceIntelligence";
import { ReportPreview } from "@/components/report/ReportPreview";
import { ShareButton } from "@/components/share/ShareButton";
import { TwinPanel } from "@/components/panels/TwinPanel";
import { useTranslator } from "@/lib/i18n/context";
import { findingText } from "@/lib/report/finding-text";
import { localizeChangeDetail, localizeFindingCategory, localizeScoreComponent, localizeScoreExplanation } from "@/lib/report/scan-copy";

/** The band's colour is presentation; its name is copy, so it lives in the catalog. */
const BAND: Record<string, { key: "bandGuarded" | "bandModerate" | "bandElevated" | "bandExposed"; color: string }> = {
  guarded: { key: "bandGuarded", color: "#38e1c3" },
  moderate: { key: "bandModerate", color: "#5b8cff" },
  elevated: { key: "bandElevated", color: "#f5c451" },
  exposed: { key: "bandExposed", color: "#ff8a5b" },
};

function ScoreRing({ value, color }: { value: number; color: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const off = c * (1 - value / 100);
  return (
    <div className="relative h-32 w-32">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(148,173,214,0.12)" strokeWidth="8" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(0.22,1,0.36,1)", filter: `drop-shadow(0 0 8px ${color}66)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-semibold text-ink">{value}</span>
        <span className="mono text-[11px] uppercase tracking-wider text-ink-faint">/ 100</span>
      </div>
    </div>
  );
}

export function Summary({
  result,
  onSelectAsset,
  onOpenAttacker,
}: {
  result: ScanResult;
  onSelectAsset: (id: string) => void;
  onOpenAttacker: () => void;
}) {
  const tr = useTranslator();
  const s = (key: Parameters<typeof tr.t<"scan">>[1], values?: Record<string, string | number>) => tr.t("scan", key, values);
  const [showScore, setShowScore] = useState(false);
  const band = BAND[result.score.band]!;
  const { stats } = result;

  return (
    <div className="scroll-thin h-full space-y-4 overflow-y-auto px-4 py-4">
      {result.isDemo && (
        <div className="rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-[12px] text-accent">
          {s("demoDataset")}
        </div>
      )}

      {result.coverage && !result.coverage.complete && (
        <div className={`rounded-lg border px-3 py-2 text-[12px] ${result.coverage.discoveryComplete ? "border-risk-medium/30 bg-risk-medium/5 text-risk-medium" : "border-risk-high/40 bg-risk-high/5 text-risk-high"}`}>
          <span className="font-medium">
            {result.coverage.discoveryComplete ? s("enrichmentIncomplete") : s("discoveryIncomplete")}
          </span>{" "}
          {s("coverageDetail", { count: result.coverage.failed.length, providers: result.coverage.failed.map((f) => f.provider).join(", ") })}
        </div>
      )}

      <ShareButton result={result} />

      <div className="panel flex items-center gap-4 p-4">
        <ScoreRing value={result.score.value} color={band.color} />
        <div>
          <div className="mono text-[12px] uppercase tracking-wider text-ink-faint">{s("protectionPosture")}</div>
          <div className="mt-1 text-lg font-medium" style={{ color: band.color }}>{s(band.key)}</div>
          <div className="mono mt-1 text-[11px] text-ink-faint">{s("higherIsBetter")}</div>
          <button onClick={() => setShowScore((v) => !v)} className="mono mt-2 text-[12px] text-signal hover:underline">
            {showScore ? s("hideBreakdown") : s("whyPosture", { value: result.score.value })}
          </button>
        </div>
      </div>

      {showScore && (
        <div className="panel space-y-2 p-4">
          <p className="text-xs leading-relaxed text-ink-soft">{localizeScoreExplanation(result, tr)}</p>
          <div className="space-y-1.5 pt-1">
            {result.score.components.map((c) => (
              <div key={c.code} className="flex items-center justify-between gap-3 text-xs">
                <span className="text-ink-soft">{localizeScoreComponent(c, result, tr)}</span>
                <span className={`mono font-medium ${c.impact < 0 ? "text-risk-high" : "text-signal"}`}>
                  {c.impact > 0 ? "+" : ""}
                  {c.impact}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Stat label={s("statAssets")} value={stats.assets} />
        <Stat label={s("statWebSurfaces")} value={stats.webSurfaces} />
        <Stat label={s("statShadowSignals")} value={stats.shadowAssets} tone={stats.shadowAssets ? "warn" : "ok"} />
        <Stat label={s("statHighPriority")} value={stats.highPriorityFindings} tone={stats.highPriorityFindings ? "warn" : "ok"} />
      </div>

      <button
        onClick={onOpenAttacker}
        className="scan-sweep relative w-full overflow-hidden rounded-xl border border-signal/30 bg-signal/5 px-4 py-3 text-left transition hover:bg-signal/10"
      >
        <div className="mono text-[12px] uppercase tracking-wider text-signal">{s("attackerView").replace("▶ ", "")}</div>
        <div className="mt-0.5 text-sm text-ink">{s("replayCaption")}</div>
      </button>

      <ReportPreview result={result} />

      <AiSummary result={result} />

      <InvestigationPanel result={result} />

      <ProtectionPanel result={result} onSelectAsset={onSelectAsset} />

      <TwinPanel graph={result.graph} />

      <HistoryPanel target={result.target} isDemo={result.isDemo} />

      {result.changeSummary && result.changeSummary.events.length > 0 && (
        <Changes summary={result.changeSummary} onSelect={onSelectAsset} assetsByCanon={new Map(result.graph.assets.map((a) => [a.canonical, a.id]))} />
      )}

      <div>
        <div className="mono mb-2 flex items-center justify-between text-[12px] uppercase tracking-wider text-ink-faint">
          <span>{s("findingsHeading")}</span>
          <span>{result.findings.length}</span>
        </div>
        <div className="space-y-2">
          {result.findings.map((f) => (
            <FindingCard key={f.id} finding={f} target={result.target} onSelect={() => onSelectAsset(f.assetId)} />
          ))}
          {result.findings.length === 0 && (
            <div className="rounded-xl border border-signal/15 bg-signal/[.035] px-4 py-6 text-center"><div className="mx-auto grid h-9 w-9 place-items-center rounded-full border border-signal/20 text-sm text-signal">✓</div><div className="mt-3 text-xs font-medium text-ink">{s("findingsEmptyTitle")}</div><div className="mt-1 text-[11px] leading-5 text-ink-faint">{s("findingsEmptyBody")}</div></div>
          )}
        </div>
      </div>
    </div>
  );
}

function AiSummary({ result }: { result: ScanResult }) {
  const tr = useTranslator();
  const s = (key: Parameters<typeof tr.t<"scan">>[1], values?: Record<string, string | number>) => tr.t("scan", key, values);
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [text, setText] = useState("");
  const [source, setSource] = useState<"template" | "openai">("template");
  const generate = async () => {
    setState("loading");
    try {
      const res = await fetch("/api/explain", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(result) });
      const data = await res.json();
      if (!res.ok) throw new Error();
      setText(data.summary);
      setSource(data.source);
      setState("done");
    } catch {
      setState("error");
    }
  };
  if (state === "idle" || state === "loading" || state === "error") {
    return (
      <button
        onClick={generate}
        disabled={state === "loading"}
        className="mono w-full rounded-xl border border-line px-4 py-2.5 text-left text-xs text-ink-soft transition hover:bg-base-700/40 disabled:opacity-60"
      >
        {state === "loading" ? s("writingSummary") : state === "error" ? s("summaryFailed") : s("generateSummary")}
      </button>
    );
  }
  return (
    <div className="panel p-4">
      <div className="mono mb-2 flex items-center justify-between text-[12px] uppercase tracking-wider text-ink-faint">
        <span>{s("executiveSummary")}</span>
        <span className={source === "openai" ? "text-signal" : "text-ink-faint"}>
          {source === "openai" ? s("aiGenerated") : s("deterministic")}
        </span>
      </div>
      <p className="text-[13px] leading-relaxed text-ink-soft">{text}</p>
    </div>
  );
}

const CHANGE_META: Record<ChangeType, { mark: string; key: "changeNew" | "changeReturned" | "changeGone" | "changeTech" | "changeCert" | "changePriority"; color: string }> = {
  asset_appeared: { mark: "+", key: "changeNew", color: "#38e1c3" },
  asset_returned: { mark: "↻", key: "changeReturned", color: "#f5c451" },
  asset_disappeared: { mark: "−", key: "changeGone", color: "#6b7793" },
  technology_changed: { mark: "≠", key: "changeTech", color: "#5b8cff" },
  certificate_changed: { mark: "⚿", key: "changeCert", color: "#5b8cff" },
  priority_changed: { mark: "▲", key: "changePriority", color: "#ff8a5b" },
};

function Changes({
  summary,
  onSelect,
  assetsByCanon,
}: {
  summary: ChangeSummary;
  onSelect: (id: string) => void;
  assetsByCanon: Map<string, string>;
}) {
  const tr = useTranslator();
  const s = (key: Parameters<typeof tr.t<"scan">>[1], values?: Record<string, string | number>) => tr.t("scan", key, values);
  const c = summary.counts;
  return (
    <div>
      <div className="mono mb-2 flex items-center justify-between text-[12px] uppercase tracking-wider text-ink-faint">
        <span>{s("sinceLastScan")}</span>
        <span className="flex gap-2">
          {c.appeared > 0 && <span className="text-signal">{s("countNew", { count: c.appeared })}</span>}
          {c.returned > 0 && <span className="text-risk-medium">{s("countReturned", { count: c.returned })}</span>}
          {c.disappeared > 0 && <span className="text-ink-faint">{s("countGone", { count: c.disappeared })}</span>}
        </span>
      </div>
      <div className="space-y-1.5">
        {summary.events.map((e, i) => {
          const meta = CHANGE_META[e.type];
          const assetId = assetsByCanon.get(e.canonical);
          return (
            <button
              key={i}
              onClick={() => assetId && onSelect(assetId)}
              className="panel motion-card flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-base-700/40"
            >
              <span className="mono mt-0.5 w-3 shrink-0 text-center" style={{ color: meta.color }}>{meta.mark}</span>
              <div className="min-w-0 flex-1">
                <div className="mono truncate text-[12px] text-ink">{e.label}</div>
                <div className="mt-0.5 text-[12px] leading-snug text-ink-soft">{localizeChangeDetail(e, tr)}</div>
                {e.from && e.to && (
                  <div className="mono mt-0.5 text-[11px] text-ink-faint">{e.from} → {e.to}</div>
                )}
              </div>
              <span className="mono shrink-0 text-[11px] uppercase tracking-wide" style={{ color: meta.color }}>{s(meta.key)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "ok" }: { label: string; value: number; tone?: "ok" | "warn" }) {
  return (
    <div className="panel motion-card px-3 py-2.5">
      <div className={`text-2xl font-semibold ${tone === "warn" && value > 0 ? "text-risk-high" : "text-ink"}`}>{value}</div>
      <div className="mono text-[11px] uppercase tracking-wide text-ink-faint">{label}</div>
    </div>
  );
}

function FindingCard({ finding, target, onSelect }: { finding: Finding; target: string; onSelect: () => void }) {
  const tr = useTranslator();
  const s = (key: Parameters<typeof tr.t<"scan">>[1], values?: Record<string, string | number>) => tr.t("scan", key, values);
  // The same resolver the PDF uses. Until now this layer was wired only into
  // the report, so a Slovak reader got Slovak findings on paper and English
  // ones on the screen they actually work from.
  const text = findingText(finding, tr.locale);
  const [open, setOpen] = useState(false);
  const [explain, setExplain] = useState<{ state: "idle" | "loading" | "done"; text: string; source: string }>({ state: "idle", text: "", source: "" });
  const runExplain = async () => {
    setExplain((s) => ({ ...s, state: "loading" }));
    try {
      const res = await fetch("/api/explain", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ finding, target }) });
      const data = await res.json();
      setExplain({ state: "done", text: data.explanation ?? "", source: data.source ?? "" });
    } catch {
      setExplain({ state: "idle", text: "", source: "" });
    }
  };
  return (
    <div className="panel motion-card overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-base-700/40">
        <PriorityDot priority={finding.priority} />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] text-ink">{text.title}</div>
          <div className="mono mt-0.5 truncate text-[12px] text-ink-faint">{localizeFindingCategory(finding.category, tr)}</div>
        </div>
        <span className="mono text-[11px] text-ink-faint">{Math.round(finding.confidence * 100)}%</span>
      </button>
      {open && (
        <div className="space-y-2.5 border-t border-line px-3 py-3 text-xs">
          <Row label={s("rowObserved")} tag="observed" text={text.observation} />
          {text.inference && <Row label={s("rowInferred")} tag="inferred" text={text.inference} />}
          <Row label={s("rowConcern")} tag="possible" text={text.concern} />
          <div>
            <div className="mono text-[11px] uppercase tracking-wide text-ink-faint">{s("rowReasoning")}</div>
            <p className="mt-0.5 leading-relaxed text-ink-soft">{s("findingReasoningGeneric", { confidence: Math.round(finding.confidence * 100) })}</p>
          </div>
          <div>
            <div className="mono text-[11px] uppercase tracking-wide text-ink-faint">{s("rowRecommended")}</div>
            <p className="mt-0.5 leading-relaxed text-ink">{text.recommendation}</p>
          </div>
          <EvidenceIntelligencePanel orgId="" target={target} findingId={finding.id} />
          {explain.state === "done" ? (
            <div className="rounded-lg border border-line bg-base-850 p-2.5">
              <div className="mono mb-1 flex items-center justify-between text-[11px] uppercase tracking-wide text-ink-faint">
                <span>{s("plainEnglish")}</span>
                <span className={explain.source === "openai" ? "text-signal" : "text-ink-faint"}>{explain.source === "openai" ? s("explainAi") : s("deterministic")}</span>
              </div>
              <p className="leading-relaxed text-ink-soft">{explain.text}</p>
            </div>
          ) : (
            <button onClick={runExplain} disabled={explain.state === "loading"} className="mono text-[12px] text-signal hover:underline disabled:opacity-60">
              {explain.state === "loading" ? s("explaining") : s("explainButton")}
            </button>
          )}
          <div className="flex items-center justify-between pt-1">
            <Confidence value={finding.confidence} />
            <button onClick={onSelect} className="mono text-[12px] text-signal hover:underline">
              {s("viewAsset")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, tag, text }: { label: string; tag: "observed" | "inferred" | "possible"; text: string }) {
  return (
    <div>
      <div className="mb-0.5 flex items-center gap-2">
        <span className="mono text-[11px] uppercase tracking-wide text-ink-faint">{label}</span>
        <AssuranceTag assurance={tag} />
      </div>
      <p className="leading-relaxed text-ink-soft">{text}</p>
    </div>
  );
}
