/**
 * Evolution learning — detector reliability from founder incident feedback.
 *
 * When the founder marks a finding as a false positive or confirms it as a real
 * incident, Evolution records it per detector category and learns how reliable
 * each detector is. That reliability then bounded-down-weights the confidence of
 * future findings from a noisy detector — transparent and reversible: remove the
 * feedback and the factor returns to 1. It never silences a detector (a floor
 * keeps every detector audible) and never inflates confidence.
 */

import { prisma as database } from "@/lib/db/prisma";
import { storageMode } from "@/lib/config/storage";
import type { Finding } from "@/lib/types";

export type IncidentVerdict = "false_positive" | "confirmed";

/** The detector categories findings are tagged with — the unit of reliability learning. */
export const DETECTOR_CATEGORIES = [
  "shadow-asset",
  "non-production-exposure",
  "auth-surface",
  "surface-change",
  "mail-security",
  "known-vulnerability",
  "threat-intelligence",
  "breach-exposure",
  "certificate-expiry",
  "domain-expiry",
  "exposed-service",
  "infrastructure-concentration",
  "insecure-redirect",
  "security-headers",
] as const;

export function isDetectorCategory(value: string): boolean {
  return (DETECTOR_CATEGORIES as readonly string[]).includes(value);
}

export interface IncidentSignal {
  id: string;
  category: string;
  verdict: IncidentVerdict;
  actor: string;
}

const g = globalThis as unknown as { __outsideEvolutionIncidents?: IncidentSignal[] };
function mem() {
  return (g.__outsideEvolutionIncidents ??= []);
}
function db() {
  return storageMode() === "database" ? database : null;
}

/** Record a founder verdict on a finding's detector category. */
export async function recordIncident(input: { category: string; verdict: IncidentVerdict; actor: string }): Promise<void> {
  const id = crypto.randomUUID();
  const conn = db();
  if (conn) {
    await conn.evolutionIncidentSignal.create({ data: { id, category: input.category, verdict: input.verdict, actor: input.actor } });
  } else {
    mem().push({ id, ...input });
  }
}

/** Every incident verdict on record. */
export async function listIncidents(): Promise<IncidentSignal[]> {
  const conn = db();
  if (conn) {
    const rows = await conn.evolutionIncidentSignal.findMany();
    return rows.map((r) => ({ id: r.id, category: r.category, verdict: r.verdict as IncidentVerdict, actor: r.actor }));
  }
  return [...mem()];
}

/** Test-only reset of the in-memory fallback store. */
export function __resetIncidents(): void {
  g.__outsideEvolutionIncidents = [];
}

// --- pure reliability signals (no I/O; unit-tested directly) -----------------

export interface DetectorReliability {
  category: string;
  confirmed: number;
  falsePositive: number;
  /** Confidence multiplier in [FLOOR, 1]. 1 = fully trusted, FLOOR = maximally dampened. */
  factor: number;
}

/** A detector is dampened, never silenced: its confidence floor is 40% of stated. */
export const RELIABILITY_FLOOR = 0.4;

/**
 * Per-detector reliability learned from founder feedback: the factor is the share
 * of decided incidents that were confirmed real, mapped into [FLOOR, 1]. Detectors
 * with no feedback are absent (callers treat that as factor 1 — no adjustment).
 */
export function detectorReliability(incidents: IncidentSignal[]): Map<string, DetectorReliability> {
  const tally = new Map<string, { confirmed: number; falsePositive: number }>();
  for (const i of incidents) {
    const t = tally.get(i.category) ?? { confirmed: 0, falsePositive: 0 };
    if (i.verdict === "confirmed") t.confirmed += 1;
    else t.falsePositive += 1;
    tally.set(i.category, t);
  }
  const out = new Map<string, DetectorReliability>();
  for (const [category, t] of tally) {
    const total = t.confirmed + t.falsePositive;
    const share = total === 0 ? 1 : t.confirmed / total;
    const factor = RELIABILITY_FLOOR + (1 - RELIABILITY_FLOOR) * share;
    out.set(category, { category, confirmed: t.confirmed, falsePositive: t.falsePositive, factor });
  }
  return out;
}

/** Just the confidence multipliers per category, for applying to findings. */
export function reliabilityFactors(incidents: IncidentSignal[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const [category, r] of detectorReliability(incidents)) m.set(category, r.factor);
  return m;
}

/**
 * Down-weight (never inflate) each finding's confidence by its detector's learned
 * factor. Returns a new array; the input is untouched. A no-op when nothing has
 * been learned yet.
 */
export function applyDetectorReliability(findings: Finding[], factors: Map<string, number>): Finding[] {
  if (factors.size === 0) return findings;
  return findings.map((f) => {
    const factor = factors.get(f.category);
    if (factor === undefined || factor >= 1) return f;
    return { ...f, confidence: Math.max(0, f.confidence * factor) };
  });
}
