/** Target normalization, public-suffix attribution, and egress safety. */

import { BlockList, isIP } from "node:net";

export class InvalidTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTargetError";
  }
}

const LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
const DOMAIN_RE = new RegExp(`^(?:${LABEL}\\.)+[a-z]{2,63}$`, "i");
const BLOCKED_TLDS = new Set(["local", "localhost", "internal", "test", "example", "invalid", "onion"]);

/** Normalize URL-like user input into a canonical public FQDN. */
export function normalizeDomain(input: string): string {
  if (typeof input !== "string") throw new InvalidTargetError("Target must be a string.");
  let value = input.trim().toLowerCase();
  if (!value) throw new InvalidTargetError("Enter a domain.");

  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  value = value.split("/")[0] ?? value;
  value = value.split("@").pop() ?? value;
  value = value.split(":")[0] ?? value;
  value = value.replace(/\.$/, "");
  if (value.startsWith("*.")) value = value.slice(2);

  if (value.length > 253) throw new InvalidTargetError("Domain is too long.");
  if (isIpLiteral(value)) throw new InvalidTargetError("Enter a domain name, not an IP address.");
  try {
    value = new URL(`http://${value}`).hostname;
  } catch {
    throw new InvalidTargetError("That does not look like a valid domain.");
  }
  if (!DOMAIN_RE.test(value)) throw new InvalidTargetError("That does not look like a valid domain.");
  if (BLOCKED_TLDS.has(value.split(".").pop() as string)) {
    throw new InvalidTargetError("Internal or reserved domains cannot be scanned.");
  }
  return value;
}

export function isIpLiteral(value: string): boolean {
  const unwrapped = value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
  return isIP(unwrapped) !== 0 || value.includes(":");
}

const blockedV4 = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blockedV4.addSubnet(network, prefix, "ipv4");

const blockedV6 = new BlockList();
for (const [network, prefix] of [
  ["::", 128], ["::1", 128], ["::ffff:0:0", 96], ["64:ff9b::", 96], ["64:ff9b:1::", 48],
  ["100::", 64], ["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20], ["5f00::", 16], ["fc00::", 7],
  ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
] as const) blockedV6.addSubnet(network, prefix, "ipv6");

/** True only for syntactically valid, globally routable addresses. */
export function isSafePublicIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return !blockedV4.check(ip, "ipv4");
  if (family === 6) return !blockedV6.check(ip, "ipv6");
  return false;
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
