/**
 * CISA Known Exploited Vulnerabilities (KEV) feed sync.
 *
 * Enriches the deterministic known-vulnerability correlation with the live,
 * authoritative CISA KEV catalogue: which CVEs are actively exploited in the
 * wild, when they were added, whether they are linked to ransomware campaigns,
 * and the federal remediation due date. Correlation degrades to the curated
 * static `kev` flags when the catalogue has not been synced, so the product
 * always works offline.
 *
 * The catalogue is a global, non-tenant resource cached in-process and refreshed
 * on a schedule (see /api/cron/kev-sync). The default feed is CISA's public JSON;
 * OUTSIDE_KEV_FEED_URL can override it (e.g. an internal mirror). The sync only
 * fetches a single trusted, operator-configured URL — it is not target input and
 * does not pass through the scan egress path.
 */

export const DEFAULT_KEV_FEED_URL =
  "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";

const MAX_FEED_BYTES = 16 * 1024 * 1024; // ~2 MB today; generous ceiling.
const FETCH_TIMEOUT_MS = 20_000;

export interface KevRecord {
  cveId: string;
  vendor: string;
  product: string;
  name: string;
  /** ISO date (YYYY-MM-DD) the CVE was added to the KEV catalogue. */
  dateAdded: string;
  /** Federal remediation due date, when present. */
  dueDate?: string;
  knownRansomware: boolean;
  shortDescription: string;
}

export interface KevIndex {
  get(cveId: string): KevRecord | undefined;
  readonly size: number;
  readonly syncedAt: string | null;
  readonly source: string | null;
}

interface KevCacheState {
  records: Map<string, KevRecord>;
  syncedAt: string | null;
  source: string | null;
}

const cache: KevCacheState = { records: new Map(), syncedAt: null, source: null };

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Parse the CISA KEV feed shape into normalized records. Pure and defensive. */
export function parseKevCatalog(raw: unknown): KevRecord[] {
  const vulnerabilities = raw && typeof raw === "object" ? (raw as { vulnerabilities?: unknown }).vulnerabilities : undefined;
  if (!Array.isArray(vulnerabilities)) return [];
  const out: KevRecord[] = [];
  for (const entry of vulnerabilities) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const cveId = str(e.cveID).toUpperCase();
    if (!/^CVE-\d{4}-\d{4,}$/.test(cveId)) continue;
    out.push({
      cveId,
      vendor: str(e.vendorProject),
      product: str(e.product),
      name: str(e.vulnerabilityName),
      dateAdded: str(e.dateAdded),
      dueDate: str(e.dueDate) || undefined,
      knownRansomware: str(e.knownRansomwareCampaignUse).toLowerCase() === "known",
      shortDescription: str(e.shortDescription),
    });
  }
  return out;
}

/** Replace the in-process catalogue. Returns the number of records loaded. */
export function applyKevCatalog(records: KevRecord[], source: string, now = new Date()): number {
  const map = new Map<string, KevRecord>();
  for (const record of records) map.set(record.cveId, record);
  cache.records = map;
  cache.syncedAt = now.toISOString();
  cache.source = source;
  return map.size;
}

/** Current in-process KEV index (empty until the first successful sync). */
export function currentKevIndex(): KevIndex {
  const { records, syncedAt, source } = cache;
  return {
    get: (cveId) => records.get(cveId.trim().toUpperCase()),
    size: records.size,
    syncedAt,
    source,
  };
}

function feedUrl(override?: string): string {
  return (override ?? process.env.OUTSIDE_KEV_FEED_URL ?? DEFAULT_KEV_FEED_URL).trim();
}

/** Fetch and parse the KEV catalogue from a single trusted HTTPS URL. */
export async function fetchKevCatalog(options: { url?: string; signal?: AbortSignal } = {}): Promise<KevRecord[]> {
  const url = feedUrl(options.url);
  if (new URL(url).protocol !== "https:") throw new Error("KEV feed URL must be HTTPS.");

  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(new Error("KEV feed request timed out.")), FETCH_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout.signal]) : timeout.signal;
  try {
    const res = await fetch(url, { signal, headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`KEV feed returned ${res.status}`);
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (Number.isFinite(declared) && declared > MAX_FEED_BYTES) throw new Error("KEV feed exceeded the allowed size.");
    const text = await res.text();
    if (text.length > MAX_FEED_BYTES) throw new Error("KEV feed exceeded the allowed size.");
    return parseKevCatalog(JSON.parse(text));
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch the catalogue and swap it into the in-process cache. */
export async function syncKev(options: { url?: string; signal?: AbortSignal; now?: Date } = {}): Promise<{ count: number; source: string; syncedAt: string }> {
  const source = feedUrl(options.url);
  const records = await fetchKevCatalog(options);
  if (!records.length) throw new Error("KEV feed contained no usable records.");
  const now = options.now ?? new Date();
  const count = applyKevCatalog(records, source, now);
  return { count, source, syncedAt: now.toISOString() };
}

export function __resetKevIndex(): void {
  cache.records = new Map();
  cache.syncedAt = null;
  cache.source = null;
}
