/**
 * Helpers for constructing demo assets/edges with the same shape the real
 * discovery engine produces. Demo data is always flagged isDemo upstream and
 * clearly labeled in the UI — it is never presented as a real scan.
 */

import type { Asset, AssetKind, DiscoveryMethod, Edge, Evidence } from "@/lib/types";

const NOW = "2026-07-07T02:14:00.000Z";

let seq = 0;
export function resetSeq() {
  seq = 0;
}

export function ev(
  method: DiscoveryMethod,
  provider: string,
  summary: string,
  detail?: string,
  observedAt = NOW,
): Evidence {
  return { method, provider, summary, detail, observedAt };
}

export interface AssetSpec {
  kind: AssetKind;
  label: string;
  canonical?: string;
  discoveredVia: DiscoveryMethod[];
  evidence: Evidence[];
  orgConfidence?: number;
  firstObservedAt?: string;
  attrs?: Asset["attrs"];
}

export function asset(spec: AssetSpec): Asset {
  const canonical = (spec.canonical ?? spec.label).toLowerCase().replace(/\.$/, "");
  return {
    id: `a_${canonical.replace(/[^a-z0-9]/gi, "_")}_${seq++}`,
    kind: spec.kind,
    label: spec.label,
    canonical,
    firstObservedAt: spec.firstObservedAt ?? NOW,
    lastObservedAt: NOW,
    discoveredVia: spec.discoveredVia,
    evidence: spec.evidence,
    signals: [], // filled by the engine's classification pass
    priority: "info",
    orgConfidence: spec.orgConfidence ?? 0.95,
    attrs: spec.attrs ?? {},
  };
}

export function edge(
  from: Asset,
  to: Asset,
  kind: Edge["kind"],
  confidence: number,
  evidence: Evidence[],
): Edge {
  return { id: `e_${from.id}_${to.id}_${kind}`, from: from.id, to: to.id, kind, confidence, evidence };
}
