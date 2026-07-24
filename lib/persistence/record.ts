/**
 * Orchestrates persistence + change detection for a completed scan. Kept
 * separate from both the engine and the store so the flow is testable against
 * any ScanStore implementation.
 */

import type { ScanResult } from "@/lib/types";
import type { ChangeSummary, ScanStore } from "./model";
import { diffScans, summarize, toSnapshot } from "./diff";
import { applyHistoryFlags } from "./diff";

/**
 * Persist a scan and compute its change summary against the target's history.
 * Mutates `result` to attach `changeSummary` and to flag newly-observed assets
 * from real history (not naming heuristics). Persistence failure is non-fatal:
 * the scan result is still returned, just without history.
 */
export async function recordScan(store: ScanStore, result: ScanResult, orgId: string, throwOnError = false): Promise<ChangeSummary | null> {
  try {
    const target = await store.getOrCreateTarget(orgId, result.target);
    const snapshots = result.graph.assets.map((a) => toSnapshot(a, result.scanId, ""));
    const { previousScanId, previousSnapshots, seenBefore } = await store.saveScan(target, result, snapshots);

    const events = diffScans(previousSnapshots, snapshots, seenBefore);
    const appeared = new Set(events.filter((e) => e.type === "asset_appeared" || e.type === "asset_returned").map((e) => e.canonical));
    applyHistoryFlags(result, appeared);

    const summary = summarize(previousScanId, events);
    result.changeSummary = summary;
    return summary;
  } catch (err) {
    if (throwOnError) throw err;
    console.warn("[persistence] recordScan failed (non-fatal):", (err as Error).message);
    return null;
  }
}
