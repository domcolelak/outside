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
export function detectCoverageGaps(kev: KevIndex, now = new Date(), limit = 25): EvolutionGap[] {
  const gaps: EvolutionGap[] = [];
  for (const rec of kev.all()) {
    if (COVERED_CVES.has(rec.cveId)) continue;
    const product = matchProduct(rec);
    if (!product) continue;
    gaps.push({
      id: `GAP-${rec.cveId}`,
      cveId: rec.cveId,
      product,
      kevVendor: rec.vendor,
      kevProduct: rec.product,
      dateAdded: rec.dateAdded,
      dueDate: rec.dueDate,
      knownRansomware: rec.knownRansomware,
      externalSignalScore: signalScore(rec, now),
    });
  }
  return gaps.sort((a, b) => b.externalSignalScore - a.externalSignalScore).slice(0, limit);
}

/** Turn gaps into evidence-backed DRAFT proposals awaiting founder approval. */
export function buildProposals(gaps: EvolutionGap[]): EvolutionProposal[] {
  return gaps.map((g) => ({
    id: `EVP-${g.cveId}`,
    gapId: g.id,
    title: `Add correlation for ${g.cveId} (${g.product})`,
    status: "draft" as const,
    requiresFounderApproval: true as const,
    priority: g.externalSignalScore >= 0.8 ? "high" : g.externalSignalScore >= 0.6 ? "medium" : "low",
    summary: `${g.cveId} is exploited in the wild (CISA KEV${g.knownRansomware ? ", ransomware-linked" : ""}) and affects ${g.kevVendor} ${g.kevProduct}, a product OUTSIDE fingerprints but does not yet correlate.`,
    proposedChange: `Add a curated ${g.cveId} entry for the ${g.product} product to KNOWN_VULNERABILITIES, with its affected version range, so the scanner correlates it (KEV/EPSS enrichment then applies automatically).`,
    evidence: { cveId: g.cveId, kevDateAdded: g.dateAdded, source: "CISA KEV" },
  }));
}
