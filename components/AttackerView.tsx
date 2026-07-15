"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ScanResult } from "@/lib/types";
import { AssetGraph } from "@/components/graph/AssetGraph";
import { PresentationControls } from "@/components/experience/PresentationControls";

export function AttackerView({ result, onClose, autoPresent = false }: { result: ScanResult; onClose: () => void; autoPresent?: boolean }) {
  const beats = result.timeline;
  const totalDuration = Math.max(...beats.map((beat) => beat.t), 8) + 3;
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [showTimeline, setShowTimeline] = useState(true);
  const originRef = useRef(performance.now());
  const baseRef = useRef(0);
  const rafRef = useRef(0);

  const seek = useCallback((value: number) => { baseRef.current = Math.max(0, Math.min(totalDuration, value)); originRef.current = performance.now(); setElapsed(baseRef.current); }, [totalDuration]);
  const restart = useCallback(() => { seek(0); setPlaying(true); }, [seek]);

  useEffect(() => {
    if (!playing) return;
    originRef.current = performance.now(); baseRef.current = elapsed;
    const tick = (now: number) => {
      const next = Math.min(totalDuration, baseRef.current + ((now - originRef.current) / 1_000) * speed);
      setElapsed(next);
      if (next < totalDuration) rafRef.current = requestAnimationFrame(tick); else setPlaying(false);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // elapsed is intentionally captured only when playback starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed, totalDuration]);

  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === " ") { event.preventDefault(); setPlaying((value) => !value); }
      if (event.key === "ArrowRight") seek(elapsed + 2);
      if (event.key === "ArrowLeft") seek(elapsed - 2);
    };
    window.addEventListener("keydown", keys); return () => window.removeEventListener("keydown", keys);
  }, [elapsed, onClose, seek]);

  useEffect(() => { if (autoPresent) restart(); }, [autoPresent, restart]);

  const beatIndex = useMemo(() => beats.reduce((latest, beat, index) => beat.t <= elapsed + .001 ? index : latest, -1), [beats, elapsed]);
  const reveal = useMemo(() => {
    const assetIds = new Set<string>(); const edgeIds = new Set<string>();
    for (let index = 0; index <= beatIndex; index += 1) { beats[index]?.revealAssetIds.forEach((id) => assetIds.add(id)); beats[index]?.revealEdgeIds.forEach((id) => edgeIds.add(id)); }
    const root = result.graph.assets.find((asset) => asset.kind === "root_domain"); if (root) assetIds.add(root.id);
    return { assets: result.graph.assets.filter((asset) => assetIds.has(asset.id)), edges: result.graph.edges.filter((edge) => edgeIds.has(edge.id)), activeBeat: beatIndex >= 0 ? beats[beatIndex] : undefined };
  }, [beatIndex, beats, result.graph]);
  const finished = elapsed >= totalDuration - .05;
  const evidence = reveal.activeBeat ? result.graph.assets.filter((asset) => reveal.activeBeat?.revealAssetIds.includes(asset.id)).flatMap((asset) => asset.evidence.map((item) => ({ ...item, asset: asset.label }))).slice(0, 2) : [];

  return <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-base-950">
    <div className="grid-backdrop pointer-events-none absolute inset-0 opacity-70"/><div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-signal/[.035] to-transparent"/>
    <header data-capture-hide className="relative z-30 flex items-center justify-between border-b border-line px-4 py-3 md:px-6"><div className="flex items-center gap-3"><span className="mono rounded-lg border border-signal/25 bg-signal/[.06] px-2.5 py-1.5 text-[9px] uppercase tracking-[.2em] text-signal">Attacker View</span><div><div className="text-xs text-ink-soft">How the public surface reveals itself</div><div className="mono mt-0.5 text-[8px] uppercase text-ink-faint">Discovery only · never exploitation</div></div></div><div className="flex items-center gap-2"><PresentationControls name={`outside-${result.target}`} onPresent={restart}/><button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl border border-line text-ink-faint transition hover:border-line-strong hover:text-ink">×</button></div></header>
    <div className="relative min-h-0 flex-1 lg:grid lg:grid-cols-[minmax(0,1fr)_300px]">
      <main className="relative min-h-0"><AssetGraph assets={reveal.assets} edges={reveal.edges} selectedId={null} onSelect={() => undefined} focusPulseId={reveal.activeBeat?.revealAssetIds[0] ?? null} showLabels controls/>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex min-h-[260px] flex-col items-center justify-end px-6 pb-12 pt-24" style={{ background: "linear-gradient(to top, rgba(5,7,10,.98) 22%, rgba(5,7,10,.68) 58%, transparent)" }}>
          {!finished && reveal.activeBeat && <div key={reveal.activeBeat.t} className="animate-rise-in text-center"><div className="mono text-[10px] uppercase tracking-[.22em] text-signal">{String(beatIndex + 1).padStart(2,"0")} · {reveal.activeBeat.emphasis === "signal" ? "Meaningful signal" : "Public observation"}</div><h2 className="display-type mx-auto mt-3 max-w-3xl text-2xl font-medium tracking-tight text-ink md:text-4xl">{reveal.activeBeat.headline}</h2><p className="mono mx-auto mt-2 max-w-2xl text-xs text-ink-soft md:text-sm">{reveal.activeBeat.detail}</p>{evidence.length > 0 && <div className="mt-5 flex flex-wrap justify-center gap-2">{evidence.map((item,index) => <div key={`${item.asset}-${index}`} className="animate-evidence rounded-lg border border-line bg-base-950/75 px-3 py-2 text-left backdrop-blur"><div className="mono text-[8px] uppercase text-accent">Evidence · {item.provider}</div><div className="mt-1 max-w-sm text-[10px] text-ink-soft">{item.asset} — {item.summary}</div></div>)}</div>}</div>}
          {finished && <div className="animate-rise-in text-center"><div className="mono text-[10px] uppercase tracking-[.22em] text-signal">External surface established</div><h2 className="display-type mt-3 text-3xl font-semibold tracking-tight text-gradient md:text-5xl">{reveal.assets.length} public assets. One domain. {Math.round(totalDuration)} seconds.</h2><p className="mt-3 text-sm text-ink-soft">Every conclusion remains connected to deterministic public evidence.</p><button onClick={restart} className="pointer-events-auto mt-5 rounded-xl bg-signal px-5 py-2.5 text-xs font-semibold text-base-950">Replay the story</button></div>}
        </div>
      </main>
      <aside data-capture-hide className={`relative z-10 hidden border-l border-line bg-base-900/55 transition lg:block ${showTimeline ? "" : "lg:hidden"}`}><div className="border-b border-line p-4"><div className="mono text-[9px] uppercase tracking-[.18em] text-ink-faint">Discovery timeline</div><div className="mt-2 flex items-baseline justify-between"><span className="text-lg font-medium text-ink">Guided sequence</span><span className="mono text-[9px] text-signal">{beatIndex + 1}/{beats.length}</span></div></div><div className="scroll-thin h-[calc(100%-78px)] overflow-y-auto p-4">{beats.map((beat,index) => <button key={`${beat.t}-${index}`} onClick={() => { seek(beat.t); setPlaying(false); }} className={`relative w-full border-l pb-5 pl-5 text-left transition ${index <= beatIndex ? "border-signal/35" : "border-line"}`}><span className={`absolute -left-[5px] top-0 h-2.5 w-2.5 rounded-full border-2 border-base-900 transition ${index === beatIndex ? "bg-signal shadow-glow" : index < beatIndex ? "bg-signal-dim" : "bg-base-600"}`}/><div className={`mono text-[8px] uppercase ${index === beatIndex ? "text-signal" : "text-ink-faint"}`}>{beat.t.toFixed(0)}s · {beat.revealAssetIds.length} revealed</div><div className={`mt-1 text-xs ${index === beatIndex ? "text-ink" : "text-ink-soft"}`}>{beat.headline}</div></button>)}</div></aside>
    </div>
    <footer data-capture-hide className="relative z-30 flex items-center gap-3 border-t border-line bg-base-950/88 px-4 py-3 backdrop-blur-xl md:px-6"><button onClick={() => finished ? restart() : setPlaying((value) => !value)} className="mono grid h-9 w-9 place-items-center rounded-xl border border-signal/25 bg-signal/[.06] text-[10px] text-signal">{finished ? "↻" : playing ? "Ⅱ" : "▶"}</button><input aria-label="Replay position" type="range" min={0} max={totalDuration} step={.05} value={elapsed} onChange={(event) => { seek(Number(event.target.value)); setPlaying(false); }} className="h-1 flex-1 cursor-pointer accent-signal"/><span className="mono w-20 text-right text-[9px] text-ink-faint">{elapsed.toFixed(1)} / {totalDuration.toFixed(0)}s</span><div className="hidden items-center gap-1 sm:flex">{[.75,1,1.5].map((value) => <button key={value} onClick={() => setSpeed(value)} className={`mono rounded-md px-2 py-1 text-[8px] ${speed === value ? "bg-signal/10 text-signal" : "text-ink-faint"}`}>{value}×</button>)}</div><button onClick={() => setShowTimeline((value) => !value)} className="mono hidden rounded-lg border border-line px-2.5 py-2 text-[8px] text-ink-faint lg:block">{showTimeline ? "Hide steps" : "Show steps"}</button></footer>
  </div>;
}
