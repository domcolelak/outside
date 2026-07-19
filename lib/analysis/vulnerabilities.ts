/**
 * Known-vulnerability correlation.
 *
 * Deterministic, offline correlation of technology versions that a verified
 * host disclosed (Server / X-Powered-By response headers) against a curated set
 * of high-signal known vulnerabilities and end-of-life branches. This turns a
 * surface map into a risk view without any external API or scan.
 *
 * Honesty guardrails, consistent with the rest of the pipeline:
 *  - A match is a *correlation*, never a confirmed exploit. The concern text and
 *    confidence reflect that version banners can be stale, spoofed, or patched
 *    by a distribution without changing the reported version (backporting).
 *  - Only fires when the host itself disclosed a parseable product + version.
 *  - The dataset is a curated seed of well-known, internet-facing issues. A live
 *    NVD / CISA-KEV feed sync is the production path (see docs/ROADMAP.md) and
 *    would slot in behind the same matcher.
 */

import type { Asset, Finding, Priority } from "@/lib/types";

export interface KnownVulnerability {
  /** Normalized product key (see PRODUCT_ALIASES). */
  product: string;
  /** CVE id, or a stable label for a branch/EOL advisory. */
  ref: string;
  title: string;
  /** CVSS v3 base score, 0..10. */
  cvss: number;
  /** Listed in CISA's Known Exploited Vulnerabilities catalogue. */
  kev: boolean;
  /** Affected when the parsed version satisfies every present bound. */
  range: { gte?: string; lt?: string; lte?: string; eq?: string };
  fixedIn?: string;
  summary: string;
  recommendation: string;
}

/**
 * Curated seed set. Each entry is a real, well-known, internet-facing issue or a
 * clearly end-of-life branch. Kept deliberately small and high-confidence rather
 * than a partial NVD mirror.
 */
export const KNOWN_VULNERABILITIES: readonly KnownVulnerability[] = [
  {
    product: "apache", ref: "CVE-2021-41773", title: "Apache HTTP Server path traversal and RCE",
    cvss: 7.5, kev: true, range: { eq: "2.4.49" }, fixedIn: "2.4.51",
    summary: "A path-traversal flaw in httpd 2.4.49 can expose files outside the document root and, with mod_cgi enabled, allow remote code execution.",
    recommendation: "Upgrade httpd to 2.4.51 or later. 2.4.50 only partially fixed the issue.",
  },
  {
    product: "apache", ref: "CVE-2021-42013", title: "Apache HTTP Server path traversal (incomplete-fix)",
    cvss: 7.5, kev: true, range: { eq: "2.4.50" }, fixedIn: "2.4.51",
    summary: "The 2.4.50 fix for CVE-2021-41773 was incomplete; 2.4.50 remains exploitable for traversal and RCE.",
    recommendation: "Upgrade httpd to 2.4.51 or later.",
  },
  {
    product: "apache", ref: "EOL-APACHE-2.2", title: "Apache HTTP Server 2.2 branch is end-of-life",
    cvss: 7.0, kev: false, range: { lt: "2.4.0" }, fixedIn: "2.4.x (supported branch)",
    summary: "The httpd 2.2 branch reached end-of-life in 2017 and no longer receives security fixes, so it accumulates unpatched vulnerabilities over time.",
    recommendation: "Migrate to a supported 2.4.x release and retire the 2.2 branch.",
  },
  {
    product: "nginx", ref: "CVE-2021-23017", title: "nginx DNS resolver off-by-one",
    cvss: 7.7, kev: false, range: { lt: "1.20.1" }, fixedIn: "1.20.1",
    summary: "An off-by-one in nginx's DNS resolver can lead to memory corruption when the resolver directive is used.",
    recommendation: "Upgrade nginx to 1.20.1 / 1.21.0 or later, or ensure the resolver directive is not exposed to untrusted DNS.",
  },
  {
    product: "openssl", ref: "CVE-2014-0160", title: "OpenSSL Heartbleed memory disclosure",
    cvss: 7.5, kev: true, range: { gte: "1.0.1", lt: "1.0.1g" }, fixedIn: "1.0.1g",
    summary: "The TLS heartbeat extension in OpenSSL 1.0.1 before 1.0.1g leaks process memory, potentially including private keys.",
    recommendation: "Upgrade OpenSSL to 1.0.1g or later and rotate any keys that were live on the affected service.",
  },
  {
    product: "openssl", ref: "CVE-2022-3602", title: "OpenSSL 3.0 X.509 buffer overflow",
    cvss: 7.5, kev: false, range: { gte: "3.0.0", lt: "3.0.7" }, fixedIn: "3.0.7",
    summary: "A buffer overflow in X.509 name-constraint checking affects OpenSSL 3.0.0 through 3.0.6.",
    recommendation: "Upgrade OpenSSL to 3.0.7 or later.",
  },
  {
    product: "php", ref: "EOL-PHP-5", title: "PHP 5.x is end-of-life",
    cvss: 7.0, kev: false, range: { lt: "7.0.0" }, fixedIn: "a supported PHP release (8.x)",
    summary: "PHP 5.x reached end-of-life in 2018/2019 and receives no security fixes; internet-facing 5.x is broadly exposed.",
    recommendation: "Migrate to a supported PHP release (8.x) and retire 5.x.",
  },
  {
    product: "php", ref: "EOL-PHP-7", title: "PHP 7.x is end-of-life",
    cvss: 5.0, kev: false, range: { gte: "7.0.0", lt: "8.0.0" }, fixedIn: "a supported PHP release (8.x)",
    summary: "The PHP 7.x branch reached end-of-life and no longer receives security fixes.",
    recommendation: "Migrate to a supported PHP release (8.x).",
  },
  {
    product: "iis", ref: "CVE-2017-7269", title: "Microsoft IIS 6.0 WebDAV remote code execution",
    cvss: 9.8, kev: true, range: { eq: "6.0" }, fixedIn: "a supported IIS release",
    summary: "A buffer overflow in the WebDAV ScStoragePathFromUrl function allows unauthenticated remote code execution on IIS 6.0.",
    recommendation: "Retire IIS 6.0 (Windows Server 2003 is end-of-life) and move to a supported Windows Server / IIS release.",
  },
  {
    product: "openssh", ref: "CVE-2018-15473", title: "OpenSSH username enumeration",
    cvss: 5.3, kev: false, range: { lt: "7.7" }, fixedIn: "7.7",
    summary: "OpenSSH before 7.7 allows remote attackers to test whether a username is valid by observing authentication timing/behaviour.",
    recommendation: "Upgrade OpenSSH to 7.7 or later.",
  },
  {
    product: "exim", ref: "CVE-2019-10149", title: "Exim remote command execution ('Return of the WIZard')",
    cvss: 9.8, kev: true, range: { gte: "4.87", lt: "4.92" }, fixedIn: "4.92",
    summary: "Improper validation of the recipient address in deliver_message() allows remote command execution in Exim 4.87–4.91.",
    recommendation: "Upgrade Exim to 4.92 or later immediately.",
  },
  {
    product: "proftpd", ref: "CVE-2015-3306", title: "ProFTPD mod_copy arbitrary file read/write",
    cvss: 9.8, kev: true, range: { lt: "1.3.5" }, fixedIn: "1.3.5a",
    summary: "The mod_copy module allows unauthenticated clients to copy files, leading to remote code execution on ProFTPD before 1.3.5a.",
    recommendation: "Upgrade ProFTPD to 1.3.5a or later, or disable mod_copy.",
  },
] as const;

/** Header product tokens → normalized product keys. */
const PRODUCT_ALIASES: Record<string, string> = {
  apache: "apache",
  "apache httpd": "apache",
  httpd: "apache",
  nginx: "nginx",
  openssl: "openssl",
  php: "php",
  iis: "iis",
  "microsoft-iis": "iis",
  openssh: "openssh",
  exim: "exim",
  proftpd: "proftpd",
};

/** A dotted segment as [numeric, letter-suffix] so OpenSSL-style "1.0.1e" orders correctly. */
function segmentValue(segment: string): [number, number] {
  const m = /^(\d+)([a-z])?$/i.exec(segment.trim());
  if (!m) return [0, 0];
  return [parseInt(m[1]!, 10), m[2] ? m[2].toLowerCase().charCodeAt(0) - 96 : 0];
}

/** Compare dotted version strings numerically; missing segments count as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".");
  const pb = b.split(".");
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const [na, la] = segmentValue(pa[i] ?? "");
    const [nb, lb] = segmentValue(pb[i] ?? "");
    if (na !== nb) return na < nb ? -1 : 1;
    if (la !== lb) return la < lb ? -1 : 1;
  }
  return 0;
}

function inRange(version: string, range: KnownVulnerability["range"]): boolean {
  if (range.eq !== undefined) {
    // Exact-or-more-specific match: "2.4.49" matches "2.4.49"; "6.0" matches "6.0.x".
    const eqParts = range.eq.split(".").length;
    const truncated = version.split(".").slice(0, eqParts).join(".");
    return compareVersions(truncated, range.eq) === 0;
  }
  if (range.gte !== undefined && compareVersions(version, range.gte) < 0) return false;
  if (range.lt !== undefined && compareVersions(version, range.lt) >= 0) return false;
  if (range.lte !== undefined && compareVersions(version, range.lte) > 0) return false;
  return true;
}

export interface ParsedTechnology {
  product: string;
  version: string;
  raw: string;
}

/**
 * Extract every `Name/Version` or `Name_Version` token from a technology string.
 * A single Server header can carry several (e.g. "Apache/2.4.6 OpenSSL/1.0.1e").
 */
export function parseTechnologies(technology: string): ParsedTechnology[] {
  const out: ParsedTechnology[] = [];
  const re = /([A-Za-z][A-Za-z-]*(?:\s?HTTPD)?)[\/_ ]v?(\d+(?:\.\d+){0,3}[a-z]?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(technology)) !== null) {
    const name = m[1]!.trim().toLowerCase();
    const product = PRODUCT_ALIASES[name];
    if (product) out.push({ product, version: m[2]!, raw: `${m[1]!.trim()}/${m[2]!}` });
  }
  return out;
}

function priorityFor(v: KnownVulnerability): Priority {
  if (v.kev || v.cvss >= 9) return "critical";
  if (v.cvss >= 7) return "high";
  if (v.cvss >= 4) return "medium";
  return "low";
}

function fid(assetId: string, ref: string): string {
  return `find_${assetId}_vuln_${ref}`.replace(/[^a-z0-9_]/gi, "_");
}

/**
 * Correlate the versions hosts disclosed against the known-vulnerability set.
 * Returns findings in the same shape as the rest of the analysis pipeline.
 */
export function correlateKnownVulnerabilities(assets: Asset[], now: string): Finding[] {
  const out: Finding[] = [];
  for (const asset of assets) {
    const technologies = Array.isArray(asset.attrs.technologies) ? (asset.attrs.technologies as string[]) : [];
    if (!technologies.length) continue;

    const parsed = technologies.flatMap(parseTechnologies);
    if (!parsed.length) continue;

    const seen = new Set<string>();
    for (const tech of parsed) {
      for (const vuln of KNOWN_VULNERABILITIES) {
        if (vuln.product !== tech.product || !inRange(tech.version, vuln.range)) continue;
        if (seen.has(vuln.ref)) continue;
        seen.add(vuln.ref);

        const priority = priorityFor(vuln);
        // Version-banner correlation carries inherent uncertainty (stale banners,
        // backported distro patches). KEV membership raises confidence somewhat.
        const confidence = Math.min(0.85, (vuln.kev ? 0.7 : 0.6) + (vuln.cvss >= 9 ? 0.05 : 0));
        const kevNote = vuln.kev ? " This vulnerability is in CISA's Known Exploited Vulnerabilities catalogue." : "";

        out.push({
          id: fid(asset.id, vuln.ref),
          title: vuln.title,
          priority,
          confidence,
          assetId: asset.id,
          category: "known-vulnerability",
          observation: `${asset.label} disclosed ${tech.raw} in its response headers.`,
          inference: `${tech.raw} matches ${vuln.ref} (CVSS ${vuln.cvss.toFixed(1)}${vuln.kev ? ", CISA KEV" : ""}).`,
          concern: `${vuln.summary}${kevNote} A version banner is not proof the running build is vulnerable — distributions sometimes backport fixes without changing the reported version — so treat this as a prioritized item to confirm, not a confirmed exploit.`,
          reasoning: `Deterministic correlation of the disclosed version (${tech.version}) against a curated known-vulnerability set. Affected range: ${describeRange(vuln)}.`,
          recommendation: vuln.recommendation,
          evidence: asset.evidence,
          discoveryMethod: "technology_fingerprint",
          createdAt: now,
        });
      }
    }
  }
  return out;
}

function describeRange(v: KnownVulnerability): string {
  if (v.range.eq !== undefined) return `exactly ${v.range.eq}`;
  const parts: string[] = [];
  if (v.range.gte !== undefined) parts.push(`>= ${v.range.gte}`);
  if (v.range.lt !== undefined) parts.push(`< ${v.range.lt}`);
  if (v.range.lte !== undefined) parts.push(`<= ${v.range.lte}`);
  return parts.join(", ") || "all versions";
}
