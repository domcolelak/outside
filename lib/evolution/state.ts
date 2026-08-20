/**
 * Durable Evolution run state. Records the latest scheduled gap analysis and,
 * crucially, which proposals are NEW since the last run, so a deploy or process
 * restart cannot make an old coverage gap appear new again.
 */

import { prisma as database } from "@/lib/db/prisma";
import { storageMode } from "@/lib/config/storage";

interface RunState {
  at: string;
  proposalIds: string[];
}

const g = globalThis as unknown as { __outsideEvolutionState?: { last: RunState | null; known: Set<string> } };
function store() {
  return (g.__outsideEvolutionState ??= { last: null, known: new Set<string>() });
}

function db() {
  return storageMode() === "database" ? database : null;
}

export interface EvolutionRunResult {
  at: string;
  total: number;
  /** Proposals never seen before this run (0 on the first, baseline run). */
  new: number;
  firstRun: boolean;
}

function recordMemoryRun(proposals: Array<{ id: string }>, at: string): EvolutionRunResult {
  const s = store();
  const firstRun = s.last === null;
  const ids = [...new Set(proposals.map((p) => p.id))];
  const newCount = firstRun ? 0 : ids.filter((id) => !s.known.has(id)).length;
  for (const id of ids) s.known.add(id);
  s.last = { at, proposalIds: ids };
  return { at, total: ids.length, new: newCount, firstRun };
}

/** Record a scheduled analysis; returns totals and how many proposals are new. */
export async function recordEvolutionRun(proposals: Array<{ id: string }>, at: string = new Date().toISOString()): Promise<EvolutionRunResult> {
  const conn = db();
  if (!conn) return recordMemoryRun(proposals, at);

  const ids = [...new Set(proposals.map((proposal) => proposal.id))];
  const ranAt = new Date(at);
  if (Number.isNaN(ranAt.getTime())) throw new Error("Evolution run timestamp is invalid.");

  return conn.$transaction(async (tx) => {
    // The cron endpoint is safe to retry, but two schedulers can overlap during
    // a rollout. Serialize the global baseline/new-count decision in PostgreSQL.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('outside:evolution:run'))`;
    const firstRun = (await tx.evolutionRun.count()) === 0;
    const inserted = ids.length
      ? await tx.evolutionProposalSeen.createMany({
          data: ids.map((proposalId) => ({ proposalId, firstSeenAt: ranAt })),
          skipDuplicates: true,
        })
      : { count: 0 };
    const newCount = firstRun ? 0 : inserted.count;
    await tx.evolutionRun.create({
      data: {
        ranAt,
        proposalIds: ids,
        total: ids.length,
        newCount,
        firstRun,
      },
    });
    return { at: ranAt.toISOString(), total: ids.length, new: newCount, firstRun };
  });
}

/** The last scheduled run, or null if Evolution has not run on a schedule yet. */
export async function latestEvolutionRun(): Promise<{ at: string; total: number } | null> {
  const conn = db();
  if (conn) {
    const last = await conn.evolutionRun.findFirst({ orderBy: [{ ranAt: "desc" }, { id: "desc" }] });
    return last ? { at: last.ranAt.toISOString(), total: last.total } : null;
  }
  const s = store();
  return s.last ? { at: s.last.at, total: s.last.proposalIds.length } : null;
}

export function __resetEvolutionState(): void {
  g.__outsideEvolutionState = { last: null, known: new Set<string>() };
}
