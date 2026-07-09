"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ScanResult } from "@/lib/types";
import { AssetGraph } from "@/components/graph/AssetGraph";

/**
 * Cinematic replay of how the external surface was revealed. Steps through the
 * scan timeline in real time, progressively revealing assets on the graph with
 * headline captions. Responsible framing throughout: this depicts external
 * discovery, never exploitation or compromise.
 */
export function AttackerView({ result, onClose }: { result: ScanResult; onClose: () => void }) {
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(true);
  const startRef = useRef(0);
  const rafRef = useRef(0);

  const beats = result.timeline;
  const totalDuration = Math.max(...beats.map((b) => b.t), 8) + 3;

  useEffect(() => {
    startRef.current = performance.now();
    const tick = () => {
      if (playing) {
        const t = (performance.now() - startRef.current) / 1000;
        setElapsed(Math.min(t, totalDuration));
        if (t < totalDuration) rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, totalDuration]);

  // Assets/edges revealed up to the current time.
  // Discrete index of the latest beat reached — changes only when a beat fires,
  // NOT every animation frame. Memoizing the revealed assets/edges on this keeps
  // their array references STABLE between beats so the graph simulation doesn't
  // restart on every frame (which would leave it blank).
  const beatIndex = useMemo(() => {
    let idx = 0;
    for (let i = 0; i < beats.length; i++) if (beats[i]!.t <= elapsed + 0.001) idx = i;
    return idx;
  }, [elapsed, beats]);

  const { assets, edges, activeBeat, revealedCount } = useMemo(() => {
    const revealAssetIds = new Set<string>();
    const revealEdgeIds = new Set<string>();
    let active = beats[0];
    for (let i = 0; i <= beatIndex; i++) {
      const b = beats[i]!;
      b.revealAssetIds.forEach((id) => revealAssetIds.add(id));
      b.revealEdgeIds.forEach((id) => revealEdgeIds.add(id));
      active = b;
    }
    // Root is always present.
    const root = result.graph.assets.find((a) => a.kind === "root_domain");
    if (root) revealAssetIds.add(root.id);
    return {
      assets: result.graph.assets.filter((a) => revealAssetIds.has(a.id)),
      edges: result.graph.edges.filter((e) => revealEdgeIds.has(e.id)),
      activeBeat: active,
      revealedCount: revealAssetIds.size,
    };
  }, [beatIndex, beats, result]);

  const finished = elapsed >= totalDuration - 0.05;

  const restart = () => {
    startRef.current = performance.now();
    setElapsed(0);
    setPlaying(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-base-950">
      <div className="grid-backdrop pointer-events-none absolute inset-0" />

      <div className="relative flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="mono rounded-md border border-signal/30 px-2 py-1 text-[11px] uppercase tracking-widest text-signal">
            Attacker View
          </span>
          <span className="text-sm text-ink-soft">External discovery replay · {result.target}</span>
        </div>
        <button onClick={onClose} className="rounded-md border border-line px-3 py-1.5 text-xs text-ink-soft hover:bg-base-700">
          Exit
        </button>
      </div>

      <div className="relative flex-1">
        <AssetGraph assets={assets} edges={edges} selectedId={null} onSelect={() => {}} focusPulseId={activeBeat?.revealAssetIds[0] ?? null} />

        {/* Caption — sits over a bottom scrim so it stays legible above nodes */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center px-6 pb-16 pt-24"
          style={{ background: "linear-gradient(to top, rgba(5,7,10,0.95) 30%, rgba(5,7,10,0) 100%)" }}>
          {!finished && activeBeat && (
            <div key={activeBeat.t} className="animate-fade-up text-center">
              <div className="mono text-[12px] tracking-widest text-signal">
                {String(Math.floor(activeBeat.t)).padStart(2, "0")}:{String(Math.round((activeBeat.t % 1) * 60)).padStart(2, "0")}
              </div>
              <div className="mt-2 max-w-2xl text-2xl font-medium text-ink">{activeBeat.headline}</div>
              <div className="mono mt-1 text-sm text-ink-soft">{activeBeat.detail}</div>
            </div>
          )}
          {finished && (
            <div className="animate-fade-up text-center">
              <div className="text-3xl font-semibold text-gradient">
                In {Math.round(totalDuration)} seconds, {revealedCount} public assets were mapped.
              </div>
              <div className="mono mt-2 text-sm text-ink-soft">
                Starting from a single domain — using only passive, public sources.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Transport */}
      <div className="relative flex items-center gap-4 px-6 py-4">
        <button
          onClick={finished ? restart : () => setPlaying((v) => !v)}
          className="rounded-md border border-signal/30 bg-signal/10 px-4 py-1.5 text-xs text-signal hover:bg-signal/20"
        >
          {finished ? "Replay" : playing ? "Pause" : "Play"}
        </button>
        <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-base-700">
          <div className="absolute inset-y-0 left-0 rounded-full bg-signal" style={{ width: `${(elapsed / totalDuration) * 100}%` }} />
          {beats.map((b) => (
            <div key={b.t} className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-base-600" style={{ left: `${(b.t / totalDuration) * 100}%` }} />
          ))}
        </div>
        <span className="mono text-xs text-ink-faint">
          {elapsed.toFixed(1)}s / {totalDuration.toFixed(0)}s
        </span>
      </div>
    </div>
  );
}
