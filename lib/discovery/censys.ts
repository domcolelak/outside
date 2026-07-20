/**
 * Censys host/service discovery.
 *
 * Certificate Transparency, DNS and passive-DNS find hostnames; Censys's
 * internet-wide scanning knows which *services* are actually listening on the
 * addresses those hostnames resolve to — SSH, databases, RDP, message brokers —
 * exposure the HTTPS-only observation path never sees. For each discovered
 * public IP this queries Censys for its observed services and attaches them to
 * the asset, from which the finding layer surfaces risky non-web exposure.
 *
 * Operator-keyed (CENSYS_API_ID + CENSYS_API_SECRET, HTTP basic auth): inactive
 * without both. Bounded (timeout + IP cap) and isolated — a failure is captured
 * in its ProviderRun and never fails the scan. The target's resolved IPs are the
 * query subjects, never connection destinations, so this never touches egress.
 */

import type { Asset, ProviderRun } from "@/lib/types";
import { isSafePublicIp } from "@/lib/security/target";
import { mapPool } from "./net";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_IPS = 16;
const IP_CONCURRENCY = 4;
const MAX_SERVICES = 50;

export interface HostService {
  port: number;
  name: string;
  transport: string;
}

export function censysConfigured(): boolean {
  return !!process.env.CENSYS_API_ID?.trim() && !!process.env.CENSYS_API_SECRET?.trim();
}

function authHeader(): string {
  const id = process.env.CENSYS_API_ID?.trim() ?? "";
  const secret = process.env.CENSYS_API_SECRET?.trim() ?? "";
  return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
}

/** Normalize the Censys hosts response into a bounded, de-duplicated service list. */
export function parseServices(body: unknown): HostService[] {
  const result = body && typeof body === "object" ? (body as { result?: unknown }).result : undefined;
  const services = result && typeof result === "object" ? (result as { services?: unknown }).services : undefined;
  if (!Array.isArray(services)) return [];
  const seen = new Set<number>();
  const out: HostService[] = [];
  for (const entry of services) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const port = typeof e.port === "number" && Number.isInteger(e.port) && e.port > 0 && e.port <= 65535 ? e.port : null;
    if (port === null || seen.has(port)) continue;
    seen.add(port);
    const name = typeof e.extended_service_name === "string" && e.extended_service_name.trim()
      ? e.extended_service_name.trim()
      : typeof e.service_name === "string" && e.service_name.trim()
        ? e.service_name.trim()
        : "unknown";
    const transport = typeof e.transport_protocol === "string" && e.transport_protocol.trim() ? e.transport_protocol.trim().toUpperCase() : "TCP";
    out.push({ port, name: name.slice(0, 40), transport });
    if (out.length >= MAX_SERVICES) break;
  }
  return out.sort((a, b) => a.port - b.port);
}

/** Censys services observed on a single IP. Returns [] when unconfigured or unseen (404). */
export async function lookupHostServices(ip: string, options: { signal?: AbortSignal } = {}): Promise<HostService[]> {
  if (!censysConfigured()) return [];
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(new Error("Censys request timed out.")), FETCH_TIMEOUT_MS);
  const composed = options.signal ? AbortSignal.any([options.signal, timeout.signal]) : timeout.signal;
  try {
    const res = await fetch(`https://search.censys.io/api/v2/hosts/${encodeURIComponent(ip)}`, {
      headers: { accept: "application/json", authorization: authHeader() },
      signal: composed,
    });
    if (res.status === 404) return []; // Censys has never observed this address.
    if (!res.ok) throw new Error(`Censys returned ${res.status}`);
    return parseServices(await res.json());
  } finally {
    clearTimeout(timer);
  }
}

/** Enrich assets in place with observed services; returns a single ProviderRun. */
export async function enrichCensysServices(assets: Asset[], options: { signal?: AbortSignal } = {}): Promise<ProviderRun[]> {
  if (!censysConfigured()) return [];
  const started = new Date().toISOString();

  const ipToAssets = new Map<string, Asset[]>();
  for (const asset of assets) {
    const addresses = Array.isArray(asset.attrs.addresses) ? (asset.attrs.addresses as string[]) : [];
    for (const ip of addresses) {
      if (!isSafePublicIp(ip)) continue;
      (ipToAssets.get(ip) ?? ipToAssets.set(ip, []).get(ip)!).push(asset);
    }
  }
  const ips = [...ipToAssets.keys()].slice(0, MAX_IPS);
  const errors: string[] = [];
  let observed = 0;

  try {
    const results = await mapPool(ips, IP_CONCURRENCY, (ip) => lookupHostServices(ip, options), options.signal);
    for (const result of results) {
      if (result.error) { errors.push((result.error as Error).message); continue; }
      const services = result.value;
      if (!services || !services.length) continue;
      observed += services.length;
      for (const asset of ipToAssets.get(result.item) ?? []) {
        // attrs only holds primitives/string[]; encode each service as "port/transport",
        // merging by port across an asset's multiple addresses.
        const existing = Array.isArray(asset.attrs.exposedServices) ? (asset.attrs.exposedServices as string[]) : [];
        const byPort = new Map<number, string>();
        for (const e of existing) {
          const p = Number.parseInt(e, 10);
          if (Number.isInteger(p)) byPort.set(p, e);
        }
        for (const s of services) byPort.set(s.port, `${s.port}/${s.transport}`);
        asset.attrs.exposedServices = [...byPort.values()].sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
        asset.attrs.exposedServicesSource = "Censys";
      }
    }
    return [{ provider: "Censys", method: "service_observation", status: errors.length ? "partial" : "ok", startedAt: started, finishedAt: new Date().toISOString(), observations: observed, errors: errors.slice(0, 20) }];
  } catch (error) {
    if (options.signal?.aborted) throw error;
    return [{ provider: "Censys", method: "service_observation", status: "error", startedAt: started, finishedAt: new Date().toISOString(), observations: 0, errors: [(error as Error).message] }];
  }
}
