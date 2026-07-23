/**
 * Evolution run state (in-process, like the KEV/EPSS caches). Records the latest
 * scheduled gap analysis and, crucially, which proposals are NEW since the last
 * run — so a scheduled pass can surface "3 new coverage gaps appeared" rather
 * than re-reporting the whole list. Non-critical, re-accumulates after a restart.
 */

interface RunState {
  at: string;
  proposalIds: string[];
}

const g = globalThis as unknown as { __outsideEvolutionState?: { last: RunState | null; known: Set<string> } };
function store() {
  return (g.__outsideEvolutionState ??= { last: null, known: new Set<string>() });
}

export interface EvolutionRunResult {
  at: string;
  total: number;
  /** Proposals never seen before this run (0 on the first, baseline run). */
  new: number;
  firstRun: boolean;
}

/** Record a scheduled analysis; returns totals and how many proposals are new. */
export function recordEvolutionRun(proposals: Array<{ id: string }>, at: string = new Date().toISOString()): EvolutionRunResult {
  const s = store();
  const firstRun = s.last === null;
  const ids = proposals.map((p) => p.id);
  const newCount = firstRun ? 0 : ids.filter((id) => !s.known.has(id)).length;
  for (const id of ids) s.known.add(id);
  s.last = { at, proposalIds: ids };
  return { at, total: ids.length, new: newCount, firstRun };
}

/** The last scheduled run, or null if Evolution has not run on a schedule yet. */
export function latestEvolutionRun(): { at: string; total: number } | null {
  const s = store();
  return s.last ? { at: s.last.at, total: s.last.proposalIds.length } : null;
}

export function __resetEvolutionState(): void {
  g.__outsideEvolutionState = { last: null, known: new Set<string>() };
}
