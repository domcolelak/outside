/**
 * Passive-DNS discovery expansion via commercial datasets.
 *
 * Certificate Transparency + DNS finds a lot, but providers with proprietary
 * internet-wide telemetry (SecurityTrails, Shodan, …) know subdomains that
 * never appeared on a public certificate. This layer queries the configured
 * providers for a domain's subdomains and merges them into the candidate set
 * the scan then resolves and classifies deterministically. It buys the data;
 * it does not build the telemetry.
 *
 * Each provider is env-gated by its own key (inactive without it), bounded and
 * isolated (a failure is captured in its ProviderRun and never fails the scan),
 * and every returned hostname is validated to be a real subdomain of the target
 * before it is trusted — a provider can never inject an unrelated host.
 */

import type { ProviderRun } from "@/lib/types";
import { registrableDomain } from "@/lib/security/target";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_HOSTNAMES = 500;
const LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
const FQDN_RE = new RegExp(`^(?:${LABEL}\\.)+[a-z]{2,63}$`, "i");

export function securityTrailsConfigured(): boolean {
  return !!process.env.SECURITYTRAILS_API_KEY?.trim();
}

export function shodanConfigured(): boolean {
  return !!process.env.SHODAN_API_KEY?.trim();
}

export function passiveDnsEnabled(): boolean {
  return securityTrailsConfigured() || shodanConfigured();
}

async function getJson(url: string, headers: Record<string, string>, signal?: AbortSignal): Promise<unknown> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(new Error("Passive-DNS request timed out.")), FETCH_TIMEOUT_MS);
  const composed = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal;
  try {
    const res = await fetch(url, { headers: { accept: "application/json", ...headers }, signal: composed });
    if (!res.ok) throw new Error(`${new URL(url).host} returned ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Provider results are subdomain prefixes; build FQDNs and keep only valid ones under the target. */
export function normalizeSubdomains(labels: unknown, domain: string): string[] {
  if (!Array.isArray(labels)) return [];
  const registrable = registrableDomain(domain);
  const suffix = `.${registrable}`;
  const out = new Set<string>();
  for (const label of labels) {
    if (typeof label !== "string") continue;
    const clean = label.trim().toLowerCase().replace(/\.$/, "");
    if (!clean || clean.includes("*") || clean.includes(" ")) continue;
    // Providers return bare prefixes ("api", "api.staging"); tolerate a full host too.
    const host = clean === domain || clean.endsWith(`.${domain}`) ? clean : `${clean}.${domain}`;
    if (host.length > 253 || !FQDN_RE.test(host)) continue;
    if (host !== registrable && !host.endsWith(suffix)) continue; // must be under the target
    out.add(host);
  }
  return [...out];
}

async function securityTrails(domain: string, signal?: AbortSignal): Promise<string[]> {
  const key = process.env.SECURITYTRAILS_API_KEY?.trim();
  if (!key) return [];
  const body = await getJson(`https://api.securitytrails.com/v1/domain/${encodeURIComponent(domain)}/subdomains?children_only=false`, { apikey: key }, signal);
  const subdomains = body && typeof body === "object" ? (body as { subdomains?: unknown }).subdomains : undefined;
  return normalizeSubdomains(subdomains, domain);
}

async function shodan(domain: string, signal?: AbortSignal): Promise<string[]> {
  const key = process.env.SHODAN_API_KEY?.trim();
  if (!key) return [];
  const body = await getJson(`https://api.shodan.io/dns/domain/${encodeURIComponent(domain)}?key=${encodeURIComponent(key)}`, {}, signal);
  const subdomains = body && typeof body === "object" ? (body as { subdomains?: unknown }).subdomains : undefined;
  return normalizeSubdomains(subdomains, domain);
}

/** Query every configured passive-DNS provider; returns merged hostnames + a ProviderRun each. */
export async function discoverPassiveHostnames(domain: string, options: { signal?: AbortSignal } = {}): Promise<{ hostnames: string[]; runs: ProviderRun[] }> {
  const providers: Array<{ name: string; run: () => Promise<string[]> }> = [];
  if (securityTrailsConfigured()) providers.push({ name: "SecurityTrails", run: () => securityTrails(domain, options.signal) });
  if (shodanConfigured()) providers.push({ name: "Shodan", run: () => shodan(domain, options.signal) });

  const hostnames = new Set<string>();
  const runs: ProviderRun[] = [];
  await Promise.all(providers.map(async ({ name, run }) => {
    const started = new Date().toISOString();
    try {
      const hosts = await run();
      for (const host of hosts) hostnames.add(host);
      runs.push({ provider: name, method: "passive_subdomain", status: "ok", startedAt: started, finishedAt: new Date().toISOString(), observations: hosts.length, errors: [] });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      runs.push({ provider: name, method: "passive_subdomain", status: "error", startedAt: started, finishedAt: new Date().toISOString(), observations: 0, errors: [(error as Error).message] });
    }
  }));

  return { hostnames: [...hostnames].slice(0, MAX_HOSTNAMES), runs };
}
