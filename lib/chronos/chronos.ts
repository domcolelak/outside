/**
 * Chronos — the historical (past) dimension of OUTSIDE.
 *
 * A deterministic time layer over the immutable GuardianSnapshots the platform
 * already records for every paid-organization scan. It runs no second scanner
 * and stores nothing new: each snapshot is a full inventory at a point in time,
 * so Chronos can reconstruct the external surface as it was at any moment, diff
 * any two moments, and replay how exposure evolved. Every answer is grounded in
 * recorded evidence — Chronos never invents a state that was not observed.
 */

import type { GuardianSnapshot, GuardianInventoryItem, GuardianMetrics } from "@/lib/guardian/types";

export interface ChronosState {
  observedAt: string;
  scanId: string;
  exposureScore: number;
  metrics: GuardianMetrics;
  inventory: GuardianInventoryItem[];
}

export interface ChronosAssetChange {
  canonical: string;
  label: string;
  change: "added" | "removed" | "modified";
  /** Human-readable specifics for a modified asset. */
  details: string[];
}

export interface ChronosDiff {
  from: { observedAt: string; scanId: string } | null;
  to: { observedAt: string; scanId: string };
  exposureScoreDelta: number;
  metricDeltas: Partial<Record<keyof GuardianMetrics, number>>;
  assetChanges: ChronosAssetChange[];
  summary: string;
}

export interface ChronosReplayStep {
  observedAt: string;
  scanId: string;
  exposureScore: number;
  diff: ChronosDiff;
}

function chronological(snapshots: GuardianSnapshot[]): GuardianSnapshot[] {
  return [...snapshots].sort((a, b) => a.observedAt.localeCompare(b.observedAt));
}

/** Reconstruct the surface as it was at `at`: the latest snapshot not after that instant. */
export function reconstructAt(snapshots: GuardianSnapshot[], at: string): ChronosState | null {
  let active: GuardianSnapshot | null = null;
  for (const s of chronological(snapshots)) {
    if (s.observedAt <= at) active = s;
    else break;
  }
  if (!active) return null;
  return { observedAt: active.observedAt, scanId: active.scanId, exposureScore: active.exposureScore, metrics: active.metrics, inventory: active.inventory };
}

function assetSignature(item: GuardianInventoryItem): string[] {
  const parts: string[] = [];
  if (item.technologies.length) parts.push(`tech:${[...item.technologies].sort().join(",")}`);
  if (item.addresses.length) parts.push(`ip:${[...item.addresses].sort().join(",")}`);
  parts.push(`priority:${item.priority}`);
  if (item.status) parts.push(`status:${item.status}`);
  if (item.certNotAfter) parts.push(`cert:${item.certNotAfter}`);
  if (item.redirectLocation) parts.push(`redirect:${item.redirectLocation}`);
  return parts;
}

function describeModification(a: GuardianInventoryItem, b: GuardianInventoryItem): string[] {
  const details: string[] = [];
  const at = new Set(a.technologies), bt = new Set(b.technologies);
  const added = [...bt].filter((t) => !at.has(t)), removed = [...at].filter((t) => !bt.has(t));
  if (added.length) details.push(`technology added: ${added.join(", ")}`);
  if (removed.length) details.push(`technology removed: ${removed.join(", ")}`);
  if (a.priority !== b.priority) details.push(`priority ${a.priority} → ${b.priority}`);
  if ((a.status ?? "") !== (b.status ?? "")) details.push(`status ${a.status ?? "—"} → ${b.status ?? "—"}`);
  if ((a.certNotAfter ?? "") !== (b.certNotAfter ?? "")) details.push("certificate changed");
  const aIps = a.addresses.join(","), bIps = b.addresses.join(",");
  if (aIps !== bIps) details.push("addresses changed");
  if ((a.redirectLocation ?? "") !== (b.redirectLocation ?? "")) details.push("redirect changed");
  return details;
}

/** Diff two snapshots by asset identity (canonical). `a` null = everything in `b` is new. */
export function diffSnapshots(a: GuardianSnapshot | null, b: GuardianSnapshot): ChronosDiff {
  const prev = new Map((a?.inventory ?? []).map((i) => [i.canonical, i]));
  const next = new Map(b.inventory.map((i) => [i.canonical, i]));
  const changes: ChronosAssetChange[] = [];

  for (const [canon, item] of next) {
    const before = prev.get(canon);
    if (!before) { changes.push({ canonical: canon, label: item.label, change: "added", details: [] }); continue; }
    const details = describeModification(before, item);
    if (details.length) changes.push({ canonical: canon, label: item.label, change: "modified", details });
  }
  for (const [canon, item] of prev) {
    if (!next.has(canon)) changes.push({ canonical: canon, label: item.label, change: "removed", details: [] });
  }

  const metricDeltas: Partial<Record<keyof GuardianMetrics, number>> = {};
  if (a) {
    for (const key of Object.keys(b.metrics) as Array<keyof GuardianMetrics>) {
      const delta = (b.metrics[key] as number) - (a.metrics[key] as number);
      if (delta !== 0) metricDeltas[key] = delta;
    }
  }

  const scoreDelta = a ? b.exposureScore - a.exposureScore : 0;
  const added = changes.filter((c) => c.change === "added").length;
  const removed = changes.filter((c) => c.change === "removed").length;
  const modified = changes.filter((c) => c.change === "modified").length;
  const summary = a
    ? `${added} appeared, ${removed} disappeared, ${modified} changed; exposure ${scoreDelta > 0 ? "+" : ""}${scoreDelta}.`
    : `Initial observation: ${b.inventory.length} asset(s).`;

  return {
    from: a ? { observedAt: a.observedAt, scanId: a.scanId } : null,
    to: { observedAt: b.observedAt, scanId: b.scanId },
    exposureScoreDelta: scoreDelta,
    metricDeltas,
    assetChanges: changes,
    summary,
  };
}

/** The full replay: each recorded point with its diff against the previous one. */
export function replay(snapshots: GuardianSnapshot[]): ChronosReplayStep[] {
  const ordered = chronological(snapshots);
  const steps: ChronosReplayStep[] = [];
  for (let i = 0; i < ordered.length; i += 1) {
    const prev = i > 0 ? ordered[i - 1]! : null;
    const cur = ordered[i]!;
    steps.push({ observedAt: cur.observedAt, scanId: cur.scanId, exposureScore: cur.exposureScore, diff: diffSnapshots(prev, cur) });
  }
  return steps;
}

/** Diff the surface between two instants, reconstructing each from recorded snapshots. */
export function diffBetween(snapshots: GuardianSnapshot[], from: string, to: string): ChronosDiff | null {
  const [a, b] = from <= to ? [from, to] : [to, from];
  const ordered = chronological(snapshots);
  const before = ordered.filter((s) => s.observedAt <= a).at(-1) ?? null;
  const after = ordered.filter((s) => s.observedAt <= b).at(-1) ?? null;
  if (!after) return null;
  return diffSnapshots(before && before.scanId !== after.scanId ? before : null, after);
}
