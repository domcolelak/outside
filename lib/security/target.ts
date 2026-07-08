/**
 * Target normalization and egress safety.
 *
 * OUTSIDE only ever talks to public certificate-transparency and DNS-over-HTTPS
 * endpoints in this core, but any code path that could resolve a user-supplied
 * host and connect to it must be guarded against SSRF: private ranges, loopback,
 * link-local, and cloud metadata endpoints are refused. These helpers are the
 * single chokepoint and are unit-tested.
 */

export class InvalidTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTargetError";
  }
}

const LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
const DOMAIN_RE = new RegExp(`^(?:${LABEL}\\.)+[a-z]{2,63}$`, "i");

/**
 * Normalize arbitrary user input (URL, host, "Company.COM.", scheme, port,
 * path) into a canonical registrable FQDN. Throws on anything that is not a
 * plausible public domain.
 */
export function normalizeDomain(input: string): string {
  if (typeof input !== "string") throw new InvalidTargetError("Target must be a string.");
  let value = input.trim().toLowerCase();
  if (!value) throw new InvalidTargetError("Enter a domain.");

  // Strip scheme, credentials, path, query, port.
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  value = value.split("/")[0] ?? value;
  value = value.split("@").pop() ?? value;
  value = value.split(":")[0] ?? value;
  value = value.replace(/\.$/, ""); // trailing dot

  if (value.startsWith("*.")) value = value.slice(2); // wildcard cert names

  if (value.length > 253) throw new InvalidTargetError("Domain is too long.");
  if (isIpLiteral(value)) {
    throw new InvalidTargetError("Enter a domain name, not an IP address.");
  }
  // Punycode-encode unicode labels so identity comparisons are stable.
  try {
    value = new URL(`http://${value}`).hostname;
  } catch {
    throw new InvalidTargetError("That does not look like a valid domain.");
  }
  if (!DOMAIN_RE.test(value)) {
    throw new InvalidTargetError("That does not look like a valid domain.");
  }
  if (BLOCKED_TLDS.has(value.split(".").pop() as string)) {
    throw new InvalidTargetError("Internal or reserved domains cannot be scanned.");
  }
  return value;
}

/** Reserved / non-public TLDs we refuse to scan. */
const BLOCKED_TLDS = new Set(["local", "localhost", "internal", "test", "example", "invalid", "onion"]);

export function isIpLiteral(value: string): boolean {
  return isIPv4(value) || value.includes(":");
}

function isIPv4(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

/**
 * Decide whether a resolved IP is safe to connect to. Refuses loopback,
 * private, link-local, CGNAT, and cloud metadata (169.254.169.254) targets.
 */
export function isSafePublicIp(ip: string): boolean {
  if (isIPv4(ip)) return isSafePublicIPv4(ip);
  return isSafePublicIPv6(ip.toLowerCase());
}

function isSafePublicIPv4(ip: string): boolean {
  const o = ip.split(".").map(Number) as [number, number, number, number];
  if (o.some((n) => Number.isNaN(n))) return false;
  const [a, b] = o;
  if (a === 0) return false; // "this" network
  if (a === 10) return false; // private
  if (a === 127) return false; // loopback
  if (a === 169 && b === 254) return false; // link-local + metadata
  if (a === 172 && b >= 16 && b <= 31) return false; // private
  if (a === 192 && b === 168) return false; // private
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  if (a === 192 && b === 0) return false; // 192.0.0.0/24, 192.0.2.0/24 doc
  if (a >= 224) return false; // multicast + reserved + broadcast
  return true;
}

function isSafePublicIPv6(ip: string): boolean {
  if (ip === "::1" || ip === "::") return false; // loopback / unspecified
  if (ip.startsWith("fe80")) return false; // link-local
  if (ip.startsWith("fc") || ip.startsWith("fd")) return false; // unique local
  if (ip.startsWith("::ffff:")) {
    // IPv4-mapped — validate the embedded v4.
    const v4 = ip.split(":").pop() ?? "";
    if (isIPv4(v4)) return isSafePublicIPv4(v4);
  }
  return true;
}

/** Registrable-domain heuristic for entity resolution / org attribution. */
export function registrableDomain(fqdn: string): string {
  const parts = fqdn.toLowerCase().replace(/\.$/, "").split(".");
  if (parts.length <= 2) return parts.join(".");
  const twoLevelTlds = new Set(["co.uk", "org.uk", "gov.uk", "ac.uk", "com.au", "co.nz", "co.jp"]);
  const lastTwo = parts.slice(-2).join(".");
  if (twoLevelTlds.has(lastTwo)) return parts.slice(-3).join(".");
  return lastTwo;
}
