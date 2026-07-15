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

const DOH = process.env.OUTSIDE_DOH_ENDPOINT ?? "https://cloudflare-dns.com/dns-query";
const CT = process.env.OUTSIDE_CT_ENDPOINT ?? "https://crt.sh";

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
export async function certificateTransparency(domain: string, signal?: AbortSignal): Promise<CtHostname[]> {
  const reg = registrableDomain(domain);
  const url = `${CT}/?q=${encodeURIComponent("%." + reg)}&output=json`;
  const rows = await fetchJson<Array<{ name_value: string; not_before?: string }>>(url, { timeoutMs: 12_000, maxBytes: 5_000_000, signal });
  return filterCtHosts(rows, reg);
}

async function dohQuery(name: string, type: string, signal?: AbortSignal): Promise<DohAnswer[]> {
  const url = `${DOH}?name=${encodeURIComponent(name)}&type=${type}`;
  const res = await fetchJson<DohResponse>(url, { headers: { accept: "application/dns-json" }, timeoutMs: 6_000, maxBytes: 256_000, signal });
  return res.Answer ?? [];
}

export interface DnsRecord {
  a: string[];
  aaaa: string[];
  cname: string[];
}

export async function resolveHost(host: string, signal?: AbortSignal): Promise<DnsRecord> {
  const [a, aaaa, cname] = await Promise.all([
    dohQuery(host, "A", signal).catch((error) => { if (signal?.aborted) throw error; return []; }),
    dohQuery(host, "AAAA", signal).catch((error) => { if (signal?.aborted) throw error; return []; }),
    dohQuery(host, "CNAME", signal).catch((error) => { if (signal?.aborted) throw error; return []; }),
  ]);
  const aliases = [...a, ...aaaa, ...cname]
    .filter((record) => record.type === 5)
    .map((record) => record.data.toLowerCase().replace(/\.$/, ""))
    .filter((value) => value.length <= 253 && /^[a-z0-9.-]+$/.test(value));
  return {
    a: a.filter((r) => r.type === 1).map((r) => r.data),
    aaaa: aaaa.filter((r) => r.type === 28).map((r) => r.data),
    cname: [...new Set(aliases)],
  };
}

export interface InfrastructureSignal {
  cloudProvider?: string;
  cdn?: string;
  providerEvidence: string[];
}

function hostnameMatches(hostname: string, suffix: string): boolean {
  return hostname === suffix || hostname.endsWith(`.${suffix}`);
}

/** Infer hosting only from an explicitly observed public CNAME suffix. */
export function identifyInfrastructureProvider(cnames: string[]): InfrastructureSignal {
  const mappings: Array<{ suffixes: string[]; cloudProvider?: string; cdn?: string }> = [
    { suffixes: ["cloudfront.net"], cloudProvider: "Amazon Web Services", cdn: "Amazon CloudFront" },
    { suffixes: ["amazonaws.com", "elasticbeanstalk.com", "execute-api.amazonaws.com"], cloudProvider: "Amazon Web Services" },
    { suffixes: ["azurefd.net"], cloudProvider: "Microsoft Azure", cdn: "Azure Front Door" },
    { suffixes: ["azurewebsites.net", "trafficmanager.net", "blob.core.windows.net"], cloudProvider: "Microsoft Azure" },
    { suffixes: ["run.app", "appspot.com", "googlehosted.com"], cloudProvider: "Google Cloud" },
    { suffixes: ["vercel-dns.com", "vercel.app"], cloudProvider: "Vercel", cdn: "Vercel Edge Network" },
    { suffixes: ["netlify.app", "netlify.global"], cloudProvider: "Netlify", cdn: "Netlify Edge" },
    { suffixes: ["fastly.net"], cdn: "Fastly" },
    { suffixes: ["akamaiedge.net", "edgekey.net", "edgesuite.net", "akamai.net"], cdn: "Akamai" },
    { suffixes: ["cdn.cloudflare.net"], cdn: "Cloudflare" },
    { suffixes: ["github.io"], cloudProvider: "GitHub Pages" },
  ];
  const normalized = [...new Set(cnames.map((value) => value.toLowerCase().replace(/\.$/, "")))];
  const result: InfrastructureSignal = { providerEvidence: [] };
  for (const cname of normalized) {
    const mapping = mappings.find((candidate) => candidate.suffixes.some((suffix) => hostnameMatches(cname, suffix)));
    if (!mapping) continue;
    result.cloudProvider ??= mapping.cloudProvider;
    result.cdn ??= mapping.cdn;
    result.providerEvidence.push(`Public DNS CNAME points to ${cname}.`);
  }
  return result;
}

/** Raw TXT records for a name (used by domain-ownership verification). */
export async function resolveTxt(name: string, signal?: AbortSignal): Promise<string[]> {
  const txt = await dohQuery(name, "TXT", signal).catch((error) => { if (signal?.aborted) throw error; return []; });
  return txt.filter((r) => r.type === 16).map((r) => r.data);
}

export interface MailConfig {
  mx: string[];
  spf: "present" | "missing";
  dmarc: "enforced" | "monitoring" | "missing" | "invalid";
  mtaSts: "present" | "missing";
  dnssec: "present" | "missing";
  ns: string[];
  dnsProvider?: string;
  mailProvider?: string;
}

export function identifyDnsProvider(nameservers: string[]): string | undefined {
  const joined = nameservers.join(" ").toLowerCase();
  const providers: Array<[RegExp, string]> = [
    [/cloudflare\.com/, "Cloudflare"],
    [/awsdns-[^.]+\.(com|net|org|co\.uk)/, "Amazon Route 53"],
    [/azure-dns\.(com|net|org|info)/, "Azure DNS"],
    [/googledomains\.com|google\.com/, "Google Cloud DNS"],
    [/dnsimple\.com/, "DNSimple"],
    [/domaincontrol\.com/, "GoDaddy DNS"],
    [/nsone\.net/, "NS1"],
    [/akam\.net|akamaiedge\.net/, "Akamai"],
  ];
  return providers.find(([pattern]) => pattern.test(joined))?.[1];
}

export function classifyDmarc(records: string[]): MailConfig["dmarc"] {
  const record = records.map((value) => value.replace(/^"|"$/g, "")).find((value) => /^v=DMARC1\s*;/i.test(value));
  if (!record) return "missing";
  const policy = /(?:^|;)\s*p\s*=\s*(none|quarantine|reject)(?:\s*;|$)/i.exec(record)?.[1]?.toLowerCase();
  if (!policy) return "invalid";
  return policy === "none" ? "monitoring" : "enforced";
}

export function identifyMailProvider(exchangers: string[]): string | undefined {
  const joined = exchangers.join(" ").toLowerCase();
  if (/google\.com|googlemail\.com/.test(joined)) return "Google Workspace";
  if (/protection\.outlook\.com|outlook\.com/.test(joined)) return "Microsoft 365";
  if (/pphosted\.com/.test(joined)) return "Proofpoint";
  if (/mimecast\.com/.test(joined)) return "Mimecast";
  return undefined;
}

export async function resolveMailAndNs(domain: string, signal?: AbortSignal): Promise<MailConfig> {
  const [mx, txt, ns, dmarc, mtaSts, ds] = await Promise.all([
    dohQuery(domain, "MX", signal).catch((error) => { if (signal?.aborted) throw error; return []; }),
    dohQuery(domain, "TXT", signal).catch((error) => { if (signal?.aborted) throw error; return []; }),
    dohQuery(domain, "NS", signal).catch((error) => { if (signal?.aborted) throw error; return []; }),
    dohQuery(`_dmarc.${domain}`, "TXT", signal).catch((error) => { if (signal?.aborted) throw error; return []; }),
    dohQuery(`_mta-sts.${domain}`, "TXT", signal).catch((error) => { if (signal?.aborted) throw error; return []; }),
    dohQuery(domain, "DS", signal).catch((error) => { if (signal?.aborted) throw error; return []; }),
  ]);
  const spf = txt.some((r) => /v=spf1/i.test(r.data)) ? "present" : "missing";
  const nameservers = ns.filter((r) => r.type === 2).map((r) => r.data.replace(/\.$/, ""));
  const exchangers = mx.filter((r) => r.type === 15).map((r) => r.data.replace(/^\d+\s+/, "").replace(/\.$/, ""));
  return {
    mx: exchangers,
    spf,
    dmarc: classifyDmarc(dmarc.filter((r) => r.type === 16).map((r) => r.data)),
    mtaSts: mtaSts.some((r) => r.type === 16 && /v=STSv1/i.test(r.data)) ? "present" : "missing",
    dnssec: ds.some((r) => r.type === 43) ? "present" : "missing",
    ns: nameservers,
    dnsProvider: identifyDnsProvider(nameservers),
    mailProvider: identifyMailProvider(exchangers),
  };
}

interface RdapResponse {
  events?: Array<{ eventAction?: string; eventDate?: string }>;
  entities?: Array<{ roles?: string[]; vcardArray?: [string, unknown[]] }>;
}

export interface DomainRegistration {
  expiresAt?: string;
  daysToExpiry?: number;
  registrar?: string;
}

/** Passive registration lifecycle metadata from the public RDAP bootstrap. */
export async function domainRegistration(domain: string, signal?: AbortSignal): Promise<DomainRegistration> {
  const reg = registrableDomain(domain);
  const data = await fetchJson<RdapResponse>(`https://rdap.org/domain/${encodeURIComponent(reg)}`, { timeoutMs: 8_000, maxBytes: 1_000_000, signal, headers: { accept: "application/rdap+json, application/json" } });
  const expiresAt = data.events?.find((event) => ["expiration", "expiry"].includes(event.eventAction?.toLowerCase() ?? ""))?.eventDate;
  const registrarEntity = data.entities?.find((entity) => entity.roles?.includes("registrar"));
  const vcards = registrarEntity?.vcardArray?.[1];
  const registrar = Array.isArray(vcards) ? (vcards.find((entry) => Array.isArray(entry) && entry[0] === "fn") as unknown[] | undefined)?.[3] : undefined;
  const parsed = expiresAt ? Date.parse(expiresAt) : NaN;
  return { expiresAt: Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined, daysToExpiry: Number.isFinite(parsed) ? Math.ceil((parsed - Date.now()) / 86_400_000) : undefined, registrar: typeof registrar === "string" ? registrar : undefined };
}
