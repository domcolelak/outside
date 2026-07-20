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

export interface IpClassification {
  ip: string;
  source: string;
  /** GreyNoise verdict: an IP actively scanning the internet, benign, or unseen. */
  classification: "malicious" | "benign" | "unknown";
  /** The IP was observed generating internet-wide scan/attack traffic. */
  noise: boolean;
  /** The IP belongs to a known-benign common service (RIOT: CDNs, DNS, etc.). */
  riot: boolean;
  name?: string;
  lastSeen?: string;
}

export interface DomainReputation {
  source: string;
  /** Security vendors flagging the domain as malicious / suspicious. */
  malicious: number;
  suspicious: number;
  harmless: number;
  /** Provider community reputation score (can be negative). */
  reputation: number;
}

export function abuseIpdbConfigured(): boolean {
  return !!process.env.ABUSEIPDB_API_KEY?.trim();
}

export function hibpConfigured(): boolean {
  return !!process.env.HIBP_API_KEY?.trim();
}

export function greyNoiseConfigured(): boolean {
  return !!process.env.GREYNOISE_API_KEY?.trim();
}

export function virusTotalConfigured(): boolean {
  return !!process.env.VIRUSTOTAL_API_KEY?.trim();
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

/** GreyNoise Community classification for a single IP. A 404 (never observed) reads as no signal. */
export async function checkIpGreyNoise(ip: string, options: { signal?: AbortSignal } = {}): Promise<IpClassification | null> {
  const key = process.env.GREYNOISE_API_KEY?.trim();
  if (!key) return null;
  const body = await getJson(`https://api.greynoise.io/v3/community/${encodeURIComponent(ip)}`, { key }, options.signal);
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const raw = str(b.classification).toLowerCase();
  const classification = raw === "malicious" || raw === "benign" ? raw : "unknown";
  const lastSeen = str(b.last_seen);
  const name = str(b.name);
  return {
    ip,
    source: "GreyNoise",
    classification,
    noise: b.noise === true,
    riot: b.riot === true,
    name: name && name.toLowerCase() !== "unknown" ? name : undefined,
    lastSeen: lastSeen || undefined,
  };
}

/** VirusTotal domain reputation (aggregate of security-vendor verdicts). Null when unconfigured. */
export async function checkDomainReputation(domain: string, options: { signal?: AbortSignal } = {}): Promise<DomainReputation | null> {
  const key = process.env.VIRUSTOTAL_API_KEY?.trim();
  if (!key) return null;
  const body = await getJson(`https://www.virustotal.com/api/v3/domains/${encodeURIComponent(domain)}`, { "x-apikey": key }, options.signal);
  const attrs = body && typeof body === "object" ? ((body as { data?: { attributes?: unknown } }).data?.attributes) : undefined;
  if (!attrs || typeof attrs !== "object") return null;
  const a = attrs as Record<string, unknown>;
  const stats = a.last_analysis_stats && typeof a.last_analysis_stats === "object" ? (a.last_analysis_stats as Record<string, unknown>) : {};
  return {
    source: "VirusTotal",
    malicious: num(stats.malicious),
    suspicious: num(stats.suspicious),
    harmless: num(stats.harmless),
    reputation: num(a.reputation),
  };
}
