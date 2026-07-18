"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useScan } from "@/components/useScan";
import type { StageState } from "@/components/useScan";
import { AssetGraph } from "@/components/graph/AssetGraph";
import { ScanConsole } from "@/components/panels/ScanConsole";
import { Summary } from "@/components/panels/Summary";
import { NodeDetail } from "@/components/panels/NodeDetail";
import { AttackerView } from "@/components/AttackerView";
import { VerifyPanel } from "@/components/VerifyPanel";
import { Wordmark } from "@/components/Wordmark";
import { PRIORITY_STYLE } from "@/lib/analysis/priority";
import { PresentationControls } from "@/components/experience/PresentationControls";
import { Walkthrough, type WalkthroughStep } from "@/components/experience/Walkthrough";

function ScanView() {
  const params = useSearchParams();
  const target = params.get("target");
  const mode = (params.get("mode") === "demo" ? "demo" : "auto") as "auto" | "demo";
  const scan = useScan(target, mode);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [attacker, setAttacker] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState<"none" | "pending" | "verified">("none");
  const [walkthrough, setWalkthrough] = useState(false);
  const autoPresented = useRef(false);

  const resultTarget = scan.result?.target;
  const resultIsDemo = scan.result?.isDemo;
  useEffect(() => {
    if (!resultTarget || resultIsDemo) return;
    fetch(`/api/verify?domain=${encodeURIComponent(resultTarget)}`)
      .then((r) => r.json())
      .then((d) => setVerifyStatus(d.status === "verified" ? "verified" : d.status === "pending" ? "pending" : "none"))
      .catch(() => {});
  }, [resultTarget, resultIsDemo]);
  useEffect(() => {
    if (scan.status === "done" && params.get("present") === "1" && !autoPresented.current) { autoPresented.current = true; setAttacker(true); }
  }, [params, scan.status]);

  const [query, setQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<Set<string>>(new Set());

  const selected = useMemo(() => scan.assets.find((a) => a.id === selectedId) ?? null, [scan.assets, selectedId]);

  const changedIds = useMemo(() => {
    const events = scan.result?.changeSummary?.events;
    if (!events || events.length === 0) return null;
    const byCanon = new Map(scan.assets.map((a) => [a.canonical, a.id]));
    const map = new Map<string, "new" | "returned">();
    for (const e of events) {
      const id = byCanon.get(e.canonical);
      if (!id) continue;
      if (e.type === "asset_appeared") map.set(id, "new");
      else if (e.type === "asset_returned") map.set(id, "returned");
    }
    return map.size > 0 ? map : null;
  }, [scan.result, scan.assets]);

  const matchIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q && priorityFilter.size === 0) return null;
    const ids = new Set<string>();
    for (const a of scan.assets) {
      const matchesQuery = !q || a.label.toLowerCase().includes(q) || a.kind.includes(q);
      const matchesPriority = priorityFilter.size === 0 || priorityFilter.has(a.priority);
      if (matchesQuery && matchesPriority) ids.add(a.id);
    }
    return ids;
  }, [query, priorityFilter, scan.assets]);

  const tourSteps = useMemo<WalkthroughStep[]>(() => [
    { eyebrow: "External surface", title: "The graph is the shared mental model", body: "Every node is an entity resolved from public observations. Select any node to inspect why it exists.", selector: "[data-tour='graph']" },
    { eyebrow: "Asset inspection", title: "Evidence stays one click away", body: "The asset lens separates routing, technology, signals, confidence and discovery provenance.", selector: "[data-tour='asset-lens']", action: () => setSelectedId(scan.assets.find((asset) => asset.kind !== "root_domain")?.id ?? scan.assets[0]?.id ?? null) },
    { eyebrow: "Explainability", title: "Posture is transparent", body: "The right rail explains score impact, findings, historical changes and report-ready summaries.", selector: "[data-tour='intelligence']", action: () => setSelectedId(null) },
    { eyebrow: "Cinematic replay", title: "Tell the story in under twenty seconds", body: "Attacker View replays discovery—not exploitation—with each reveal connected to literal evidence.", selector: "[data-tour='attacker']" },
  ], [scan.assets]);

  if (!target) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-ink-soft">No target specified.</p>
          <Link href="/" className="mono mt-3 inline-block text-sm text-signal hover:underline">← Back to start</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header data-capture-hide className="relative z-40 flex items-center justify-between border-b border-line bg-base-950/82 px-4 py-3 backdrop-blur-xl md:px-5">
        <div className="flex items-center gap-4">
          <Link href="/"><Wordmark className="h-5" /></Link>
          <div className="hidden items-center gap-2 md:flex">
            <span className="mono rounded-md border border-line px-2 py-1 text-xs text-ink">{scan.result?.target ?? target}</span>
            <span className="mono rounded-md border border-line px-2 py-1 text-[11px] uppercase tracking-wider text-ink-faint">
              {mode === "demo" || scan.result?.isDemo ? "Demo" : "Passive external view"}
            </span>
            {scan.result && !scan.result.isDemo && (
              verifyStatus === "verified" ? (
                <span className="mono rounded-md border border-signal/40 bg-signal/10 px-2 py-1 text-[11px] uppercase tracking-wider text-signal">
                  ✓ Verified organization
                </span>
              ) : (
                <button
                  onClick={() => setVerifyOpen(true)}
                  className="mono rounded-md border border-risk-medium/30 px-2 py-1 text-[11px] uppercase tracking-wider text-risk-medium transition hover:bg-risk-medium/10"
                >
                  Unverified — verify ownership
                </button>
              )
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {scan.status === "done" && <button onClick={() => setWalkthrough(true)} className="mono hidden rounded-lg border border-line px-3 py-2 text-[9px] uppercase text-ink-faint transition hover:border-signal/30 hover:text-signal md:block">Guided tour</button>}
          {scan.status === "done" && (
            <button data-tour="attacker" onClick={() => setAttacker(true)} className="mono rounded-lg border border-signal/30 bg-signal/10 px-3 py-2 text-[9px] uppercase tracking-wider text-signal hover:bg-signal/20">
              ▶ Attacker View
            </button>
          )}
          {scan.status === "done" && <PresentationControls name={`outside-${scan.result?.target ?? target}`} onPresent={() => setAttacker(true)} className="hidden md:flex"/>}
          <Link href="/" className="mono text-xs text-ink-soft hover:text-ink">New scan</Link>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:grid lg:grid-cols-[300px_1fr_390px] lg:grid-rows-[minmax(0,1fr)]">
        {/* Console (desktop rail; on mobile the live logs are summarized in-graph) */}
        <aside data-capture-hide className="hidden border-r border-line bg-base-900/60 lg:block">
          <ScanConsole stages={scan.stages} logs={scan.logs} scanning={scan.status === "scanning"} />
        </aside>

        {/* Graph */}
        <main data-tour="graph" className="relative min-h-[320px] flex-1 lg:min-h-0">
          <div className="grid-backdrop pointer-events-none absolute inset-0" />
          <AssetGraph
            assets={scan.assets}
            edges={scan.edges}
            selectedId={selectedId}
            onSelect={setSelectedId}
            focusPulseId={scan.status === "scanning" ? scan.latestAssetId : null}
            controls
            matchIds={matchIds}
            changedIds={changedIds}
          />
          {scan.status === "done" && scan.assets.length > 0 && (
            <GraphControls
              query={query}
              setQuery={setQuery}
              priorityFilter={priorityFilter}
              setPriorityFilter={setPriorityFilter}
            />
          )}
          {scan.status === "scanning" && <CinematicScanStatus stages={scan.stages} assetCount={scan.assets.length} latest={scan.logs.at(-1)?.message}/>}
          {scan.status === "error" && (
            <div className="absolute inset-0 flex items-center justify-center px-6">
              <div className="panel max-w-md p-6 text-center">
                <div className="mono text-xs uppercase tracking-wider text-risk-high">Scan error</div>
                <p className="mt-2 text-sm text-ink-soft">{scan.error}</p>
                <button onClick={scan.restart} className="mono mt-4 rounded-md border border-line px-3 py-1.5 text-xs text-ink hover:bg-base-700">
                  Retry
                </button>
              </div>
            </div>
          )}
          <GraphLegend />
        </main>

        {/* Right rail — stacks below the graph on mobile so findings stay reachable */}
        <aside data-tour={selected ? "asset-lens" : "intelligence"} className="block h-[46vh] shrink-0 border-t border-line bg-base-900/60 lg:h-auto lg:border-l lg:border-t-0">
          {selected ? (
            <NodeDetail asset={selected} onClose={() => setSelectedId(null)} />
          ) : scan.result ? (
            <Summary result={scan.result} onSelectAsset={setSelectedId} onOpenAttacker={() => setAttacker(true)} />
          ) : (
            <IntelligenceEmpty scanning={scan.status === "scanning"}/>
          )}
        </aside>
      </div>

      {attacker && scan.result && (
        <AttackerView result={scan.result} onClose={() => setAttacker(false)} autoPresent={params.get("present") === "1"}/>
      )}
      <Walkthrough open={walkthrough} onClose={() => setWalkthrough(false)} steps={tourSteps}/>
      {verifyOpen && resultTarget && (
        <VerifyPanel
          domain={resultTarget}
          onVerified={() => {
            setVerifyStatus("verified");
            setVerifyOpen(false);
          }}
          onClose={() => setVerifyOpen(false)}
        />
      )}
    </div>
  );
}

function CinematicScanStatus({ stages, assetCount, latest }: { stages: StageState[]; assetCount: number; latest?: string }) {
  const activeIndex = Math.max(0, stages.findIndex((stage) => stage.status === "active"));
  const active = stages[activeIndex] ?? stages[0];
  const progress = Math.max(4, ((stages.filter((stage) => stage.status === "done").length + .45) / Math.max(stages.length, 1)) * 100);
  return <div className={`pointer-events-none absolute z-20 transition-all ${assetCount ? "left-1/2 top-4 w-[min(88%,520px)] -translate-x-1/2" : "inset-0 grid place-items-center px-5"}`}><div key={active?.stage} className="premium-surface w-full animate-rise-in p-4"><div className="flex items-center gap-4"><div className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-signal/20 bg-signal/[.06]"><span className="absolute inset-2 animate-ping rounded-lg border border-signal/20"/><span className="mono relative text-[9px] text-signal">{String(activeIndex + 1).padStart(2,"0")}</span></div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><div className="mono text-[9px] uppercase tracking-[.18em] text-signal">Discovery in progress</div><div className="mono text-[8px] text-ink-faint">{assetCount} entities</div></div><div className="mt-1 text-sm font-medium text-ink">{active?.label ?? "Establishing external viewpoint"}</div><div className="mono mt-1 truncate text-[9px] text-ink-faint">{latest ?? "Opening deterministic provider sequence…"}</div></div></div><div className="mt-4 h-1 overflow-hidden rounded-full bg-base-700"><div className="h-full rounded-full bg-signal transition-[width] duration-700" style={{ width: `${progress}%` }}/></div><div className="mt-2 flex justify-between">{stages.map((stage,index) => <span key={stage.stage} className={`h-1.5 w-1.5 rounded-full transition ${stage.status === "done" ? "bg-signal" : stage.status === "active" ? "animate-pulse bg-signal" : "bg-base-600"}`} title={`${index + 1}. ${stage.label}`}/>)}</div></div></div>;
}

function IntelligenceEmpty({ scanning }: { scanning: boolean }) {
  return <div className="flex h-full items-center justify-center px-7 text-center"><div className="max-w-xs"><div className="relative mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-line bg-base-950/50"><div className={`h-2.5 w-2.5 rounded-full bg-signal ${scanning ? "animate-breathe shadow-glow" : ""}`}/><span className="absolute inset-3 rounded-xl border border-signal/10"/></div><div className="mt-5 text-sm font-medium text-ink">{scanning ? "Building the intelligence layer" : "Select an asset to inspect"}</div><p className="mt-2 text-xs leading-5 text-ink-faint">{scanning ? "Findings, evidence and posture appear only after deterministic observations are correlated." : "Routing, technology, confidence, signals and source evidence stay one click from the graph."}</p></div></div>;
}

const FILTER_PRIORITIES: Array<{ key: string; color: string; label: string }> = [
  ...(["critical", "high", "medium"] as const).map((key) => ({ key, ...PRIORITY_STYLE[key] })),
];

function GraphControls({
  query,
  setQuery,
  priorityFilter,
  setPriorityFilter,
}: {
  query: string;
  setQuery: (v: string) => void;
  priorityFilter: Set<string>;
  setPriorityFilter: (s: Set<string>) => void;
}) {
  const toggle = (key: string) => {
    const next = new Set(priorityFilter);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setPriorityFilter(next);
  };
  return (
    <div className="absolute left-3 top-3 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-2 rounded-lg border border-line bg-base-900/70 px-2.5 py-1.5 backdrop-blur">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-ink-faint" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search assets…"
          className="mono w-36 bg-transparent text-xs text-ink placeholder:text-ink-faint focus:outline-none"
        />
        {query && (
          <button onClick={() => setQuery("")} className="text-ink-faint hover:text-ink" aria-label="Clear">×</button>
        )}
      </div>
      <div className="flex items-center gap-1">
        {FILTER_PRIORITIES.map((p) => {
          const active = priorityFilter.has(p.key);
          return (
            <button
              key={p.key}
              onClick={() => toggle(p.key)}
              className={`mono flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] backdrop-blur transition ${active ? "border-signal/40 bg-signal/10 text-ink" : "border-line bg-base-900/70 text-ink-soft hover:text-ink"}`}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: p.color, boxShadow: `0 0 8px ${p.color}88` }} />
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function GraphLegend() {
  const items = [
    { c: "#e8edf6", l: "Root" },
    { c: "#ff5b6e", l: "Critical" },
    { c: "#ff8a5b", l: "High" },
    { c: "#f5c451", l: "Medium" },
    { c: "#5b8cff", l: "Low" },
    { c: "#38e1c3", l: "Info" },
  ];
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-x-3 gap-y-1 rounded-lg border border-line bg-base-900/70 px-3 py-2 backdrop-blur">
      {items.map((i) => (
        <span key={i.l} className="mono flex items-center gap-1.5 text-[10px] text-ink-soft">
          <span className="h-2 w-2 rounded-full" style={{ background: i.c, boxShadow: `0 0 8px ${i.c}88` }} />
          {i.l}
        </span>
      ))}
    </div>
  );
}

export default function ScanPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-ink-soft">Loading…</div>}>
      <ScanView />
    </Suspense>
  );
}
