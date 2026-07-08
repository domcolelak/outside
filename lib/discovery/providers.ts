/**
 * Passive discovery providers. All sources are public and non-invasive:
 *  - Certificate Transparency (crt.sh) for historically issued hostnames.
 *  - DNS-over-HTTPS (Cloudflare) for A/AAAA/MX/TXT/NS resolution.
 *
 * Providers never connect to the target's own services beyond public DNS/CT
 * lookups here, so SSRF risk is minimal; resolved IPs are still validated by the
 * security layer before any future active probing is added.
 */

import { registrableDomain } from "@/lib/security/target";
import { fetchJson } from "./net";

const DOH = "https://cloudflare-dns.com/dns-query";

interface DohAnswer {
  name: string;
  type: number;
  data: string;
}
interface DohResponse {
  Status: number;
  Answer?: DohAnswer[];
}

export interface CtHostname {
  host: string;
  firstSeen?: string;
}

/**
 * Pure entity-resolution filter for raw CT rows. Extracted so the boundary
 * logic is unit-testable without network access. Requires an exact match or a
 * proper subdomain boundary so unrelated registrable domains (e.g.
 * testexample.com vs example.com) are never falsely attributed to the target.
 */
export function filterCtHosts(
  rows: Array<{ name_value: string; not_before?: string }>,
  reg: string,
): CtHostname[] {
  const map = new Map<string, string | undefined>();
  for (const row of rows) {
    for (const raw of String(row.name_value).split("\n")) {
      const host = raw.trim().toLowerCase().replace(/^\*\./, "").replace(/\.$/, "");
      if (host !== reg && !host.endsWith("." + reg)) continue;
      if (host.includes("*") || host.includes(" ") || !host) continue;
      const existing = map.get(host);
      if (!existing || (row.not_before && row.not_before < existing)) {
        map.set(host, row.not_before);
      }
    }
  }
  return [...map.entries()].map(([host, firstSeen]) => ({ host, firstSeen }));
}

/** Query Certificate Transparency logs for hostnames under a registrable domain. */
export async function certificateTransparency(domain: string): Promise<CtHostname[]> {
  const reg = registrableDomain(domain);
  const url = `https://crt.sh/?q=${encodeURIComponent("%." + reg)}&output=json`;
  const rows = await fetchJson<Array<{ name_value: string; not_before?: string }>>(url, { timeoutMs: 12000 });
  return filterCtHosts(rows, reg);
}

async function dohQuery(name: string, type: string): Promise<DohAnswer[]> {
  const url = `${DOH}?name=${encodeURIComponent(name)}&type=${type}`;
  const res = await fetchJson<DohResponse>(url, { headers: { accept: "application/dns-json" }, timeoutMs: 6000 });
  return res.Answer ?? [];
}

export interface DnsRecord {
  a: string[];
  aaaa: string[];
}

export async function resolveHost(host: string): Promise<DnsRecord> {
  const [a, aaaa] = await Promise.all([
    dohQuery(host, "A").catch(() => []),
    dohQuery(host, "AAAA").catch(() => []),
  ]);
  return {
    a: a.filter((r) => r.type === 1).map((r) => r.data),
    aaaa: aaaa.filter((r) => r.type === 28).map((r) => r.data),
  };
}

export interface MailConfig {
  mx: string[];
  spf: "present" | "missing";
  ns: string[];
}

export async function resolveMailAndNs(domain: string): Promise<MailConfig> {
  const [mx, txt, ns] = await Promise.all([
    dohQuery(domain, "MX").catch(() => []),
    dohQuery(domain, "TXT").catch(() => []),
    dohQuery(domain, "NS").catch(() => []),
  ]);
  const spf = txt.some((r) => /v=spf1/i.test(r.data)) ? "present" : "missing";
  return {
    mx: mx.filter((r) => r.type === 15).map((r) => r.data.replace(/^\d+\s+/, "").replace(/\.$/, "")),
    spf,
    ns: ns.filter((r) => r.type === 2).map((r) => r.data.replace(/\.$/, "")),
  };
}
