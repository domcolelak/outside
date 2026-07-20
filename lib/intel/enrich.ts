/**
 * Threat-intelligence enrichment orchestrator.
 *
 * Runs the configured providers over a completed scan's discovered
 * infrastructure — bounded, isolated, and best-effort — and attaches the
 * results to asset attributes for the finding layer to read. A provider failure
 * is captured in its ProviderRun and never fails the scan.
 */

import type { Asset, ProviderRun } from "@/lib/types";
import { isSafePublicIp } from "@/lib/security/target";
import { mapPool } from "@/lib/discovery/net";
import { abuseIpdbConfigured, checkDomainBreaches, checkIpReputation, hibpConfigured } from "./providers";

const MAX_IPS = 16;
const IP_CONCURRENCY = 4;
const MAX_BREACH_NAMES = 12;

export function intelEnabled(): boolean {
  return abuseIpdbConfigured() || hibpConfigured();
}

function addressesOf(asset: Asset): string[] {
  return Array.isArray(asset.attrs.addresses) ? (asset.attrs.addresses as string[]) : [];
}

/** Enrich assets in place; returns a ProviderRun per attempted provider. */
export async function enrichThreatIntel(assets: Asset[], domain: string, options: { signal?: AbortSignal } = {}): Promise<ProviderRun[]> {
  const runs: ProviderRun[] = [];

  if (abuseIpdbConfigured()) {
    const started = new Date().toISOString();
    // Map each public IP to the assets that resolve to it, capped for responsibility.
    const ipToAssets = new Map<string, Asset[]>();
    for (const asset of assets) {
      for (const ip of addressesOf(asset)) {
        if (!isSafePublicIp(ip)) continue;
        (ipToAssets.get(ip) ?? ipToAssets.set(ip, []).get(ip)!).push(asset);
      }
    }
    const ips = [...ipToAssets.keys()].slice(0, MAX_IPS);
    const errors: string[] = [];
    let flagged = 0;
    try {
      const results = await mapPool(ips, IP_CONCURRENCY, (ip) => checkIpReputation(ip, options), options.signal);
      for (const result of results) {
        if (result.error) { errors.push((result.error as Error).message); continue; }
        const reputation = result.value;
        if (!reputation) continue;
        for (const asset of ipToAssets.get(result.item) ?? []) {
          // Keep only the worst score observed across an asset's addresses.
          if (reputation.score <= Number(asset.attrs.threatIpScore ?? 0)) continue;
          asset.attrs.threatIpScore = reputation.score;
          asset.attrs.threatIp = reputation.ip;
          asset.attrs.threatIpSource = reputation.source;
          asset.attrs.threatIpReports = reputation.reports;
          if (reputation.lastReportedAt) asset.attrs.threatIpLastReported = reputation.lastReportedAt;
        }
        if (reputation.score > 0) flagged += 1;
      }
      runs.push({ provider: "AbuseIPDB", method: "threat_intel", status: errors.length ? "partial" : "ok", startedAt: started, finishedAt: new Date().toISOString(), observations: flagged, errors: errors.slice(0, 20) });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      runs.push({ provider: "AbuseIPDB", method: "threat_intel", status: "error", startedAt: started, finishedAt: new Date().toISOString(), observations: 0, errors: [(error as Error).message] });
    }
  }

  if (hibpConfigured()) {
    const started = new Date().toISOString();
    try {
      const exposure = await checkDomainBreaches(domain, options);
      const root = assets.find((asset) => asset.kind === "root_domain");
      if (exposure && root && exposure.breaches.length) {
        const sorted = [...exposure.breaches].sort((a, b) => (b.breachDate ?? "").localeCompare(a.breachDate ?? ""));
        root.attrs.breachCount = sorted.length;
        root.attrs.breachSource = exposure.source;
        root.attrs.breachNames = sorted.slice(0, MAX_BREACH_NAMES).map((breach) => breach.title);
        const latest = sorted.find((breach) => breach.breachDate)?.breachDate;
        if (latest) root.attrs.breachLatest = latest;
      }
      runs.push({ provider: "HaveIBeenPwned", method: "threat_intel", status: "ok", startedAt: started, finishedAt: new Date().toISOString(), observations: exposure?.breaches.length ?? 0, errors: [] });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      runs.push({ provider: "HaveIBeenPwned", method: "threat_intel", status: "error", startedAt: started, finishedAt: new Date().toISOString(), observations: 0, errors: [(error as Error).message] });
    }
  }

  return runs;
}
