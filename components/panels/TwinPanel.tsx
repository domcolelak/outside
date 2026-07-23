"use client";

import { useMemo, useState } from "react";
import type { AssetGraph } from "@/lib/types";
import { buildTwin, singlePointsOfFailure } from "@/lib/twin/twin";

/**
 * Digital Twin panel — the dependency view of the surface. Reads the scan's
 * asset graph as a dependency graph and shows the nodes the most of the surface
 * hangs on, with each one's blast radius (what breaks if it fails). Client-side,
 * deterministic; renders nothing when there is no shared infrastructure.
 */
export function TwinPanel({ graph }: { graph: AssetGraph }) {
  const hubs = useMemo(() => {
    const twin = buildTwin(graph.assets, graph.edges);
    return singlePointsOfFailure(twin, 1).slice(0, 6);
  }, [graph]);
  const [open, setOpen] = useState<string | null>(null);

  if (hubs.length === 0) return null;

  return (
    <div>
      <div className="mono mb-2 flex items-center justify-between text-[11px] uppercase tracking-wider text-ink-faint">
        <span>Digital Twin · dependency &amp; blast radius</span>
        <span>{hubs.length}</span>
      </div>
      <div className="space-y-2">
        {hubs.map((h) => {
          const isOpen = open === h.node.id;
          const tone = h.dependentCount >= 8 ? "text-risk-high" : h.dependentCount >= 5 ? "text-risk-medium" : "text-signal";
          return (
            <div key={h.node.id} className="panel motion-card overflow-hidden">
              <button onClick={() => setOpen(isOpen ? null : h.node.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-base-700/40">
                <span className={`mono text-sm font-semibold ${tone}`}>{h.dependentCount}</span>
                <div className="min-w-0 flex-1">
                  <div className="mono truncate text-[12px] text-ink">{h.node.label}</div>
                  <div className="mono mt-0.5 text-[10px] uppercase tracking-wide text-ink-faint">{h.node.kind} · blast radius</div>
                </div>
                <span className="mono text-[10px] text-ink-faint">{isOpen ? "−" : "+"}</span>
              </button>
              {isOpen && (
                <div className="border-t border-line px-3 py-2.5">
                  <div className="mono mb-1.5 text-[10px] uppercase tracking-wide text-ink-faint">Impacted if this fails or is compromised</div>
                  <div className="flex flex-wrap gap-1.5">
                    {h.impacted.map((a) => (
                      <span key={a.id} className="mono rounded-sm border border-line px-1.5 py-0.5 text-[10px] text-ink-soft">{a.label}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
