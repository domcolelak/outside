/**
 * Threat-intelligence providers.
 *
 * Optional, operator-configured enrichment that queries third-party reputation
 * and breach intelligence about a scan's discovered infrastructure. Each
 * provider is env-gated by its own API key: with no key the provider returns
 * null and the product is unaffected. Calls go to a single fixed, trusted API
 * host per provider — the target's resolved IPs are query parameters, never
 * connection destinations, so this never touches the scan egress path.
 *
 * Honesty guardrails: results are third-party inferences attributed to their
 * source (reputation of an IP the host resolves to, historical breaches of an
 * organization). They are never presented as confirmed compromise of the
 * target's current systems.
 */

const FETCH_TIMEOUT_MS = 8_000;

export interface IpReputation {
  ip: string;
  source: string;
  /** 0..100 abuse-confidence score from the provider. */
  score: number;
  reports: number;
  lastReportedAt?: string;
}

export interface DomainBreach {
  name: string;
  title: string;
  breachDate?: string;
}

export interface BreachExposure {
  source: string;
  breaches: DomainBreach[];
}

export function abuseIpdbConfigured(): boolean {
  return !!process.env.ABUSEIPDB_API_KEY?.trim();
}

export function hibpConfigured(): boolean {
  return !!process.env.HIBP_API_KEY?.trim();
}

async function getJson(url: string, headers: Record<string, string>, signal?: AbortSignal): Promise<unknown> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(new Error("Threat-intel request timed out.")), FETCH_TIMEOUT_MS);
  const composed = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal;
  try {
    const res = await fetch(url, { headers: { accept: "application/json", ...headers }, signal: composed });
    if (res.status === 404) return null; // HIBP uses 404 for "no breaches".
    if (!res.ok) throw new Error(`${new URL(url).host} returned ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** AbuseIPDB reputation for a single IP. Returns null when unconfigured. */
export async function checkIpReputation(ip: string, options: { signal?: AbortSignal } = {}): Promise<IpReputation | null> {
  const key = process.env.ABUSEIPDB_API_KEY?.trim();
  if (!key) return null;
  const url = `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ip)}&maxAgeInDays=90`;
  const body = await getJson(url, { Key: key }, options.signal);
  const data = body && typeof body === "object" ? (body as { data?: unknown }).data : undefined;
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const lastReportedAt = str(d.lastReportedAt);
  return {
    ip,
    source: "AbuseIPDB",
    score: Math.max(0, Math.min(100, num(d.abuseConfidenceScore))),
    reports: num(d.totalReports),
    lastReportedAt: lastReportedAt || undefined,
  };
}

/** HaveIBeenPwned breaches recorded against an organization's domain. */
export async function checkDomainBreaches(domain: string, options: { signal?: AbortSignal } = {}): Promise<BreachExposure | null> {
  const key = process.env.HIBP_API_KEY?.trim();
  if (!key) return null;
  const url = `https://haveibeenpwned.com/api/v3/breaches?domain=${encodeURIComponent(domain)}`;
  const body = await getJson(url, { "hibp-api-key": key, "user-agent": "OUTSIDE-external-surface-monitor" }, options.signal);
  if (!Array.isArray(body)) return { source: "HaveIBeenPwned", breaches: [] };
  const breaches: DomainBreach[] = [];
  for (const entry of body) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const name = str(e.Name);
    if (!name) continue;
    breaches.push({ name, title: str(e.Title) || name, breachDate: str(e.BreachDate) || undefined });
  }
  return { source: "HaveIBeenPwned", breaches };
}
