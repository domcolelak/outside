"use client";

import { useMemo } from "react";
import { AssetGraph } from "@/components/graph/AssetGraph";
import { buildNorthstar } from "@/lib/demo/northstar";
import { detectAssetSignals, assetPriority } from "@/lib/analysis/signals";

/** Decorative, non-interactive graph behind the hero. */
export function HeroBackdrop() {
  const { assets, edges } = useMemo(() => {
    const org = buildNorthstar();
    const degree = new Map<string, number>();
    for (const e of org.edges) {
      degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
      degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
    }
    for (const a of org.assets) {
      a.signals = detectAssetSignals(a, org.edges, { linkedFromPrimary: new Set(org.linkedFromPrimary), degreeById: degree, now: "" });
      a.priority = assetPriority(a.signals);
    }
    return { assets: org.assets, edges: org.edges };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 opacity-[0.5]">
      <AssetGraph assets={assets} edges={edges} selectedId={null} onSelect={() => {}} showLabels={false} />
    </div>
  );
}
