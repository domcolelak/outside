/**
 * Pure change detection. No I/O — given the previous scan's snapshots, the
 * current scan's snapshots, and the set of canonicals ever seen before the
 * current scan, it derives the change events. Fully unit-tested.
 */

import type { Asset, Priority, ScanResult } from "@/lib/types";
import type { AssetSnapshot, ChangeEvent, ChangeSummary } from "./model";

/** Project an asset into its temporal snapshot form. */
export function toSnapshot(asset: Asset, scanId: string, identityId: string): AssetSnapshot {
  const technologies = ((asset.attrs.technologies as string[] | undefined) ?? []).slice().sort();
  const status = asset.attrs.status ? String(asset.attrs.status) : undefined;
  const certKey = asset.attrs.certFingerprint
    ? String(asset.attrs.certFingerprint)
    : asset.attrs.certIssuer
      ? String(asset.attrs.certIssuer)
      : undefined;
  return {
    scanId,
    identityId,
    canonical: asset.canonical,
    label: asset.label,
    kind: asset.kind,
    priority: asset.priority,
    technologies,
    status,
    certKey,
    present: true,
  };
}

const PRIORITY_RANK: Record<Priority, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

function maxPriority(a: Priority, b: Priority): Priority {
  return PRIORITY_RANK[a] >= PRIORITY_RANK[b] ? a : b;
}

/**
 * Diff two scans.
 * @param prev  snapshots from the immediately preceding scan (empty on first scan)
 * @param curr  snapshots from the current scan
 * @param seenBeforeCurr canonicals observed in ANY scan before the current one
 *                       (used to distinguish a brand-new asset from a returning one)
 */
export function diffScans(
  prev: AssetSnapshot[],
  curr: AssetSnapshot[],
  seenBeforeCurr: Set<string>,
): ChangeEvent[] {
  const prevByCanon = new Map(prev.map((s) => [s.canonical, s]));
  const currByCanon = new Map(curr.map((s) => [s.canonical, s]));
  const events: ChangeEvent[] = [];

  // Appeared / returned.
  for (const [canon, snap] of currByCanon) {
    if (prevByCanon.has(canon)) continue;
    const returned = seenBeforeCurr.has(canon);
    events.push({
      type: returned ? "asset_returned" : "asset_appeared",
      canonical: canon,
      label: snap.label,
      detail: returned
        ? "A previously observed asset is publicly reachable again after being absent."
        : "A new public asset appeared on the external surface.",
      priority: returned ? maxPriority(snap.priority, "medium") : maxPriority(snap.priority, "medium"),
    });
  }

  // Disappeared.
  for (const [canon, snap] of prevByCanon) {
    if (currByCanon.has(canon)) continue;
    events.push({
      type: "asset_disappeared",
      canonical: canon,
      label: snap.label,
      detail: "An asset observed in the previous scan is no longer publicly reachable.",
      priority: "low",
    });
  }

  // Technology / priority changes for assets present in both.
  for (const [canon, cur] of currByCanon) {
    const before = prevByCanon.get(canon);
    if (!before) continue;
    if (before.technologies.join("|") !== cur.technologies.join("|")) {
      events.push({
        type: "technology_changed",
        canonical: canon,
        label: cur.label,
        detail: "Observed technology signals changed since the previous scan.",
        priority: "medium",
        from: before.technologies.join(", ") || "none",
        to: cur.technologies.join(", ") || "none",
      });
    }
    if (before.certKey && cur.certKey && before.certKey !== cur.certKey) {
      events.push({
        type: "certificate_changed",
        canonical: canon,
        label: cur.label,
        detail: "The certificate presented for this hostname changed since the previous scan.",
        priority: "medium",
        from: before.certKey,
        to: cur.certKey,
      });
    }
    if (before.priority !== cur.priority && PRIORITY_RANK[cur.priority] > PRIORITY_RANK[before.priority]) {
      events.push({
        type: "priority_changed",
        canonical: canon,
        label: cur.label,
        detail: "Review priority increased since the previous scan.",
        priority: cur.priority,
        from: before.priority,
        to: cur.priority,
      });
    }
  }

  // Most significant first.
  return events.sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]);
}

export function summarize(previousScanId: string | null, events: ChangeEvent[]): ChangeSummary {
  return {
    previousScanId,
    events,
    counts: {
      appeared: events.filter((e) => e.type === "asset_appeared").length,
      returned: events.filter((e) => e.type === "asset_returned").length,
      disappeared: events.filter((e) => e.type === "asset_disappeared").length,
      changed: events.filter((e) => e.type === "technology_changed" || e.type === "priority_changed" || e.type === "certificate_changed").length,
    },
  };
}

/** Convenience: mark assets in a result as newly observed based on real history. */
export function applyHistoryFlags(result: ScanResult, appearedCanonicals: Set<string>): void {
  for (const asset of result.graph.assets) {
    if (appearedCanonicals.has(asset.canonical)) {
      asset.attrs.newlyObserved = true;
    }
  }
}
