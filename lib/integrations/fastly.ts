/**
 * Fastly — BYOK (bring your own key) adapter.
 *
 * Pure provider logic: no storage, no auth, no HTTP framework. The token travels
 * in the `Fastly-Key` header.
 *
 * Read-only. The connector catalogue historically described Fastly as managing
 * edge headers and certificate lifecycle; that is a write capability and belongs
 * to its own deliberate decision, the way Cloudflare's did. What ships here is
 * attribution: which discovered hostnames are served by services this account
 * owns.
 *
 * Fastly does not expose a flat domain list — domains hang off each service's
 * active version — so the walk is bounded to a fixed number of services rather
 * than following every service a large account might have.
 *
 * The token is passed in explicitly (from the organization's encrypted
 * credential) and is never logged, returned, or placed in an error message.
 */

import { providerGet, mapProviderStatus, networkFailure, type ProviderFailure } from "@/lib/integrations/providers/http";

const API = "https://api.fastly.com";
const LABEL = "Fastly";
/** Bounded: attribution must not turn into a crawl of a large account. */
const MAX_SERVICES = 20;
const MAX_DOMAINS = 200;

export type FastlyResult<T> = ({ ok: true } & T) | ProviderFailure;

const authHeader = (token: string) => ({ "fastly-key": token });

/** Prove the token works and read who it belongs to. Consumes no service quota. */
export async function verifyKey(token: string, signal?: AbortSignal): Promise<FastlyResult<{ account: string }>> {
  try {
    const { status, body, retryAfter } = await providerGet(`${API}/current_user`, authHeader(token), signal);
    if (status !== 200) {
      return mapProviderStatus(status, {
        label: LABEL,
        retryAfter,
        forbidden: "Rejected by Fastly — the token may lack read access to this account.",
      });
    }
    const u = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const account = typeof u.login === "string" ? u.login : typeof u.name === "string" ? u.name : "Connected";
    return { ok: true, account };
  } catch {
    return networkFailure(LABEL);
  }
}

/**
 * Domains served by this account's services. Walks at most MAX_SERVICES
 * services, taking each one's active version, so the cost is predictable
 * regardless of account size.
 */
export async function ownedDomains(token: string, signal?: AbortSignal): Promise<FastlyResult<{ domains: string[] }>> {
  try {
    const listed = await providerGet(`${API}/service`, authHeader(token), signal);
    if (listed.status !== 200) return mapProviderStatus(listed.status, { label: LABEL, retryAfter: listed.retryAfter });

    const services = Array.isArray(listed.body) ? listed.body.slice(0, MAX_SERVICES) : [];
    const domains = new Set<string>();

    for (const service of services) {
      if (!service || typeof service !== "object") continue;
      const s = service as Record<string, unknown>;
      const id = typeof s.id === "string" ? s.id : null;
      if (!id) continue;

      // Only the active version describes what Fastly is actually serving.
      const versions = Array.isArray(s.versions) ? s.versions : [];
      const active = versions.find((v) => v && typeof v === "object" && (v as { active?: unknown }).active === true) as
        | Record<string, unknown>
        | undefined;
      const number = active && typeof active.number === "number" ? active.number : null;
      if (number === null) continue;

      const detail = await providerGet(`${API}/service/${encodeURIComponent(id)}/version/${number}/domain`, authHeader(token), signal);
      if (detail.status !== 200 || !Array.isArray(detail.body)) continue;
      for (const entry of detail.body) {
        const name = entry && typeof entry === "object" ? (entry as { name?: unknown }).name : null;
        if (typeof name === "string" && name) domains.add(name.trim().toLowerCase());
        if (domains.size >= MAX_DOMAINS) break;
      }
      if (domains.size >= MAX_DOMAINS) break;
    }

    return { ok: true, domains: [...domains] };
  } catch {
    return networkFailure(LABEL);
  }
}

/** Fastly API tokens are opaque; the live test is the real check. */
export function looksLikeFastlyToken(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 20 && trimmed.length <= 200 && /^[A-Za-z0-9_-]+$/.test(trimmed);
}
