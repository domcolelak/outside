/**
 * Evolution — the future dimension. Observe how the external security world
 * changes, compare it against what OUTSIDE can actually do (the Capability
 * Registry / known-vulnerability set), find the gaps, and prepare evidence-backed
 * proposals for the founder to approve. It never acts autonomously: every output
 * is a DRAFT proposal gated on founder approval; nothing is applied, merged, or
 * deployed here.
 *
 * First, deterministic use case (per the doctrine): correlate the live CISA KEV
 * catalogue against the vulnerabilities OUTSIDE can already correlate, to surface
 * actively-exploited CVEs on technologies OUTSIDE fingerprints but cannot yet
 * evaluate.
 */

import type { KevIndex, KevRecord } from "@/lib/analysis/kev";
import { KNOWN_VULNERABILITIES } from "@/lib/analysis/vulnerabilities";

/** Products OUTSIDE fingerprints and can correlate (derived from the real set). */
const FINGERPRINTED_PRODUCTS = [...new Set(KNOWN_VULNERABILITIES.map((v) => v.product))];
/** CVEs OUTSIDE already correlates. */
const COVERED_CVES = new Set(KNOWN_VULNERABILITIES.filter((v) => /^CVE-/i.test(v.ref)).map((v) => v.ref.toUpperCase()));

export interface EvolutionGap {
  id: string;
  cveId: string;
  /** The OUTSIDE-fingerprinted product this KEV entry maps to. */
  product: string;
  kevVendor: string;
  kevProduct: string;
  dateAdded: string;
  dueDate?: string;
  knownRansomware: boolean;
  /** 0..1 urgency from the external (KEV) signal. */
  externalSignalScore: number;
  /** externalSignalScore after applying learned founder product-affinity (0..1). */
  priorityScore: number;
}

/**
 * What Evolution has learned from past founder decisions (see lib/evolution/decisions).
 * Both are optional — with neither, detection is the pure external-signal ranking.
 */
export interface LearningSignals {
  /** product → net founder affinity (approvals − rejections). */
  affinity?: Map<string, number>;
  /** proposal ids the founder already decided — dropped from the active list. */
  decided?: Set<string>;
}

/**
 * Blend the raw external signal with learned founder affinity for the product.
 * Affinity is clamped so learning nudges the ranking without ever overwhelming
 * the external evidence, and the result stays within 0..1.
 */
export function adjustedScore(base: number, affinity: number): number {
  const bounded = Math.max(-3, Math.min(3, affinity));
  return Math.max(0, Math.min(1, base + bounded * 0.05));
}

export type ProposalStatus = "draft";

export interface EvolutionProposal {
  id: string;
  gapId: string;
  title: string;
  /** Always a draft — Evolution proposes; the founder decides. */
  status: ProposalStatus;
  requiresFounderApproval: true;
  priority: "high" | "medium" | "low";
  summary: string;
  proposedChange: string;
  evidence: { cveId: string; kevDateAdded: string; source: "CISA KEV" };
}

function matchProduct(rec: KevRecord): string | null {
  const hay = `${rec.vendor} ${rec.product}`.toLowerCase();
  return FINGERPRINTED_PRODUCTS.find((p) => hay.includes(p)) ?? null;
}

function signalScore(rec: KevRecord, now: Date): number {
  let s = 0.5;
  if (rec.knownRansomware) s += 0.3;
  if (rec.dueDate && new Date(rec.dueDate) >= now) s += 0.1; // an open federal deadline
  const added = Date.parse(rec.dateAdded);
  if (Number.isFinite(added) && now.getTime() - added < 90 * 86_400_000) s += 0.1; // recent
  return Math.min(1, s);
}

/**
 * Compare the live KEV catalogue against OUTSIDE's correlation coverage. Returns
 * gaps: actively-exploited CVEs on a fingerprinted product that OUTSIDE cannot
 * yet correlate. Sorted by external urgency, capped for review.
 */
export function detectCoverageGaps(kev: KevIndex, now = new Date(), limit = 25, learning: LearningSignals = {}): EvolutionGap[] {
  const affinity = learning.affinity ?? new Map<string, number>();
  const decided = learning.decided ?? new Set<string>();
  const gaps: EvolutionGap[] = [];
  for (const rec of kev.all()) {
    if (COVERED_CVES.has(rec.cveId)) continue;
    if (decided.has(`EVP-${rec.cveId}`)) continue; // the founder already ruled on this
    const product = matchProduct(rec);
    if (!product) continue;
    const externalSignalScore = signalScore(rec, now);
    gaps.push({
      id: `GAP-${rec.cveId}`,
      cveId: rec.cveId,
      product,
      kevVendor: rec.vendor,
      kevProduct: rec.product,
      dateAdded: rec.dateAdded,
      dueDate: rec.dueDate,
      knownRansomware: rec.knownRansomware,
      externalSignalScore,
      priorityScore: adjustedScore(externalSignalScore, affinity.get(product) ?? 0),
    });
  }
  // Rank by the learned priority (external signal + founder affinity), then cap.
  return gaps.sort((a, b) => b.priorityScore - a.priorityScore).slice(0, limit);
}

/**
 * Resolve a proposal id back to the CVE + product it targets, iff it still maps
 * to a real, uncovered, fingerprinted KEV entry. Used to validate a founder
 * decision server-side rather than trusting client-supplied product/cve.
 */
export function resolveProposal(kev: KevIndex, proposalId: string): { cveId: string; product: string } | null {
  const m = /^EVP-(.+)$/.exec(proposalId);
  if (!m) return null;
  const cveId = m[1]!.toUpperCase();
  if (COVERED_CVES.has(cveId)) return null;
  const rec = kev.get(cveId);
  if (!rec) return null;
  const product = matchProduct(rec);
  return product ? { cveId, product } : null;
}

/** Turn gaps into evidence-backed DRAFT proposals awaiting founder approval. */
export function buildProposals(gaps: EvolutionGap[]): EvolutionProposal[] {
  return gaps.map((g) => ({
    id: `EVP-${g.cveId}`,
    gapId: g.id,
    title: `Add correlation for ${g.cveId} (${g.product})`,
    status: "draft" as const,
    requiresFounderApproval: true as const,
    priority: g.priorityScore >= 0.8 ? "high" : g.priorityScore >= 0.6 ? "medium" : "low",
    summary: `${g.cveId} is exploited in the wild (CISA KEV${g.knownRansomware ? ", ransomware-linked" : ""}) and affects ${g.kevVendor} ${g.kevProduct}, a product OUTSIDE fingerprints but does not yet correlate.`,
    proposedChange: `Add a curated ${g.cveId} entry for the ${g.product} product to KNOWN_VULNERABILITIES, with its affected version range, so the scanner correlates it (KEV/EPSS enrichment then applies automatically).`,
    evidence: { cveId: g.cveId, kevDateAdded: g.dateAdded, source: "CISA KEV" },
  }));
}
