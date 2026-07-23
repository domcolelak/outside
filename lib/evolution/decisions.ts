/**
 * Evolution learning — founder decisions on proposals, and the signals derived
 * from them. When the founder approves or rejects a proposal, Evolution records
 * it (persisted like the rest of the app) and learns two things:
 *
 *   1. the proposal is decided → it drops off the active "awaiting review" list;
 *   2. the founder's net affinity for that product → future proposals on the
 *      same product are reprioritised up (repeatedly approved) or down (rejected).
 *
 * The learning is bounded and transparent — it only reorders and filters what
 * gets surfaced. It never applies, writes, or deploys anything.
 */

import { prisma as database } from "@/lib/db/prisma";
import { storageMode } from "@/lib/config/storage";

export type EvolutionDecisionKind = "approved" | "rejected";

export interface EvolutionDecision {
  proposalId: string;
  cveId: string;
  product: string;
  decision: EvolutionDecisionKind;
  actor: string;
}

const g = globalThis as unknown as { __outsideEvolutionDecisions?: Map<string, EvolutionDecision> };
function mem() {
  return (g.__outsideEvolutionDecisions ??= new Map<string, EvolutionDecision>());
}
function db() {
  return storageMode() === "database" ? database : null;
}

/** Record (or overturn) a founder decision on a proposal. Idempotent per proposal. */
export async function recordDecision(d: EvolutionDecision): Promise<void> {
  const conn = db();
  if (conn) {
    await conn.evolutionDecision.upsert({
      where: { proposalId: d.proposalId },
      create: { proposalId: d.proposalId, cveId: d.cveId, product: d.product, decision: d.decision, actor: d.actor },
      update: { decision: d.decision, actor: d.actor },
    });
  } else {
    mem().set(d.proposalId, { ...d });
  }
}

/** Every decision on record (newest storage-order). */
export async function listDecisions(): Promise<EvolutionDecision[]> {
  const conn = db();
  if (conn) {
    const rows = await conn.evolutionDecision.findMany();
    return rows.map((r) => ({ proposalId: r.proposalId, cveId: r.cveId, product: r.product, decision: r.decision as EvolutionDecisionKind, actor: r.actor }));
  }
  return [...mem().values()];
}

/** Test-only reset of the in-memory fallback store. */
export function __resetDecisions(): void {
  g.__outsideEvolutionDecisions = new Map();
}

// --- pure learning signals (no I/O; unit-tested directly) -------------------

/** Proposal ids the founder has already ruled on — approved or rejected. */
export function decidedProposalIds(decisions: EvolutionDecision[]): Set<string> {
  return new Set(decisions.map((d) => d.proposalId));
}

/**
 * Net founder affinity per product: +1 for each approval, −1 for each rejection.
 * A product the founder keeps approving trends positive (surface its gaps sooner);
 * one they keep rejecting trends negative (surface them later, if at all).
 */
export function productAffinity(decisions: EvolutionDecision[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const d of decisions) {
    m.set(d.product, (m.get(d.product) ?? 0) + (d.decision === "approved" ? 1 : -1));
  }
  return m;
}
