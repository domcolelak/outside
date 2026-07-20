/**
 * EPSS (Exploit Prediction Scoring System) enrichment.
 *
 * EPSS is FIRST.org's daily model estimating the probability that a CVE will be
 * exploited in the wild within the next 30 days. It complements CVSS (severity)
 * and CISA KEV (known-exploited) by adding a forward-looking exploitation
 * likelihood, which sharpens risk prioritization. Like the KEV catalogue it is
 * a public feed cached in-process and refreshed on a schedule
 * (see /api/cron/epss-sync). It only ever annotates CVEs the deterministic
 * matcher already fired on — it never widens what is reported, and the score is
 * surfaced as an inherited probability, never invented.
 */

import { KNOWN_VULNERABILITIES } from "./vulnerabilities";

export const DEFAULT_EPSS_API = "https://api.first.org/data/v1/epss";
const FETCH_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 4 * 1024 * 1024;

export interface EpssRecord {
  cveId: string;
  /** Probability of exploitation in the next 30 days, 0..1. */
  score: number;
  /** Percentile rank against all scored CVEs, 0..1. */
  percentile: number;
}

export interface EpssIndex {
  get(cveId: string): EpssRecord | undefined;
  readonly size: number;
  readonly syncedAt: string | null;
}

interface EpssCacheState {
  records: Map<string, EpssRecord>;
  syncedAt: string | null;
}

const cache: EpssCacheState = { records: new Map(), syncedAt: null };

function clampProbability(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

/** Parse the FIRST.org EPSS API response into normalized records. Pure. */
export function parseEpssResponse(raw: unknown): EpssRecord[] {
  const data = raw && typeof raw === "object" ? (raw as { data?: unknown }).data : undefined;
  if (!Array.isArray(data)) return [];
  const out: EpssRecord[] = [];
  for (const entry of data) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const cveId = typeof e.cve === "string" ? e.cve.trim().toUpperCase() : "";
    if (!/^CVE-\d{4}-\d{4,}$/.test(cveId)) continue;
    out.push({ cveId, score: clampProbability(e.epss), percentile: clampProbability(e.percentile) });
  }
  return out;
}

export function applyEpss(records: EpssRecord[], now = new Date()): number {
  const map = new Map<string, EpssRecord>();
  for (const record of records) map.set(record.cveId, record);
  cache.records = map;
  cache.syncedAt = now.toISOString();
  return map.size;
}

export function currentEpssIndex(): EpssIndex {
  const { records, syncedAt } = cache;
  return {
    get: (cveId) => records.get(cveId.trim().toUpperCase()),
    size: records.size,
    syncedAt,
  };
}

/** The CVEs the correlation can fire on — the only ones worth scoring. */
export function knownCveIds(): string[] {
  return [...new Set(KNOWN_VULNERABILITIES.map((v) => v.ref).filter((ref) => /^CVE-\d{4}-\d{4,}$/i.test(ref)).map((ref) => ref.toUpperCase()))];
}

/** Fetch EPSS scores for a set of CVEs from the FIRST.org API. */
export async function fetchEpss(cveIds: string[], options: { url?: string; signal?: AbortSignal } = {}): Promise<EpssRecord[]> {
  if (!cveIds.length) return [];
  const base = (options.url ?? process.env.OUTSIDE_EPSS_API ?? DEFAULT_EPSS_API).trim();
  if (new URL(base).protocol !== "https:") throw new Error("EPSS API URL must be HTTPS.");
  const url = `${base}?cve=${encodeURIComponent(cveIds.join(","))}`;

  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(new Error("EPSS request timed out.")), FETCH_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout.signal]) : timeout.signal;
  try {
    const res = await fetch(url, { signal, headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`EPSS API returned ${res.status}`);
    const text = await res.text();
    if (text.length > MAX_BODY_BYTES) throw new Error("EPSS response exceeded the allowed size.");
    return parseEpssResponse(JSON.parse(text));
  } finally {
    clearTimeout(timer);
  }
}

export async function syncEpss(options: { url?: string; signal?: AbortSignal; now?: Date } = {}): Promise<{ count: number; syncedAt: string }> {
  const records = await fetchEpss(knownCveIds(), options);
  const now = options.now ?? new Date();
  const count = applyEpss(records, now);
  return { count, syncedAt: now.toISOString() };
}

export function __resetEpssIndex(): void {
  cache.records = new Map();
  cache.syncedAt = null;
}
