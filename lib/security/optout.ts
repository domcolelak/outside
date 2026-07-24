/**
 * Public-scan opt-out.
 *
 * Anyone can point an anonymous snapshot at any domain, so a domain owner needs
 * a way to say no. Ownership is proven the only way that cannot be abused by a
 * third party: control of the domain's own DNS. Publishing
 *
 *     _outside-optout.<domain>  TXT  "outside-optout=1"
 *
 * removes the domain from anonymous scanning. A stranger cannot opt a domain in
 * or out on the owner's behalf, and no support queue is involved.
 *
 * An internal denylist covers manual and legal requests. Opt-out never blocks an
 * organization that has *verified* the domain — an owner must always be able to
 * monitor their own surface.
 */

import { resolveTxt } from "@/lib/discovery/providers";
import { registrableDomain } from "@/lib/security/target";
import { prisma as database } from "@/lib/db/prisma";
import { storageMode } from "@/lib/config/storage";

export const OPTOUT_RECORD_NAME = "_outside-optout";
export const OPTOUT_RECORD_VALUE = "outside-optout=1";
/** Short enough that an opt-out takes effect quickly, long enough to not cost a lookup per scan. */
const CACHE_TTL_MS = 10 * 60_000;

export type OptOutSource = "dns" | "manual";
export interface OptOutState {
  optedOut: boolean;
  source?: OptOutSource;
}

const g = globalThis as unknown as {
  __outsideOptOutCache?: Map<string, { state: OptOutState; expires: number }>;
  __outsideOptOutManual?: Map<string, string>;
};
function cache() {
  return (g.__outsideOptOutCache ??= new Map());
}
function manualMem() {
  return (g.__outsideOptOutManual ??= new Map<string, string>());
}
function db() {
  return storageMode() === "database" ? database : null;
}

/** The name a domain owner publishes to opt out. */
export function optOutRecordName(domain: string): string {
  return `${OPTOUT_RECORD_NAME}.${registrableDomain(domain)}`;
}

/** Human-readable instructions, surfaced by the API and the Security page. */
export function optOutInstructions(domain: string) {
  return {
    recordName: optOutRecordName(domain),
    recordType: "TXT" as const,
    recordValue: OPTOUT_RECORD_VALUE,
    note: "Publish this DNS TXT record to remove the domain from anonymous scanning. Only the domain's own DNS operator can do this, so no one else can opt your domain out — or back in. It takes effect within ten minutes of propagating.",
  };
}

async function manualDenylisted(root: string): Promise<boolean> {
  const conn = db();
  if (conn) {
    const row = await conn.scanOptOut.findUnique({ where: { domain: root } });
    return !!row;
  }
  return manualMem().has(root);
}

/** Add a manual/legal opt-out. Operator action, always audited by the caller. */
export async function addManualOptOut(domain: string, reason: string, createdBy: string): Promise<void> {
  const root = registrableDomain(domain);
  const conn = db();
  if (conn) {
    await conn.scanOptOut.upsert({
      where: { domain: root },
      create: { domain: root, reason, source: "manual", createdBy },
      update: { reason, createdBy },
    });
  } else {
    manualMem().set(root, reason);
  }
  cache().delete(root);
}

/**
 * Is this domain opted out of anonymous scanning? Checks the internal denylist
 * first (cheap, authoritative), then the owner-published DNS record. A DNS
 * failure is never treated as an opt-out — it must not become a way to make a
 * domain unscannable by breaking its DNS.
 */
export async function isOptedOut(domain: string, signal?: AbortSignal): Promise<OptOutState> {
  const root = registrableDomain(domain);
  const hit = cache().get(root);
  if (hit && hit.expires > Date.now()) return hit.state;

  let state: OptOutState = { optedOut: false };
  if (await manualDenylisted(root)) {
    state = { optedOut: true, source: "manual" };
  } else {
    try {
      const records = await resolveTxt(`${OPTOUT_RECORD_NAME}.${root}`, signal);
      const found = records.some((record) => record.replace(/^"|"$/g, "").trim().toLowerCase() === OPTOUT_RECORD_VALUE);
      if (found) state = { optedOut: true, source: "dns" };
    } catch {
      // Resolution failure means "not opted out" — fail open, never fail closed.
    }
  }

  cache().set(root, { state, expires: Date.now() + CACHE_TTL_MS });
  return state;
}

/** Test-only reset of the in-process cache and memory denylist. */
export function __resetOptOut(): void {
  g.__outsideOptOutCache = new Map();
  g.__outsideOptOutManual = new Map();
}
