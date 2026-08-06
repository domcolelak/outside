/**
 * Vercel — BYOK (bring your own key) adapter.
 *
 * Pure provider logic: no storage, no auth, no HTTP framework. The token travels
 * as a bearer credential.
 *
 * Read-only by design. This connector answers one question — which of the
 * hostnames OUTSIDE discovered from the outside belong to an account you own —
 * and never writes to the account. An asset that matches nothing you own is the
 * shadow-asset candidate the product exists to surface.
 *
 * The token is passed in explicitly (from the organization's encrypted
 * credential) and is never logged, returned, or placed in an error message.
 */

import { providerGet, mapProviderStatus, networkFailure, type ProviderFailure } from "@/lib/integrations/providers/http";

const API = "https://api.vercel.com";
const LABEL = "Vercel";
/** Bounded: an attribution lookup must not turn into an unbounded crawl. */
const MAX_DOMAINS = 200;

export type VercelResult<T> = ({ ok: true } & T) | ProviderFailure;

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

/**
 * Prove the token works and read who it belongs to. /v2/user is the cheapest
 * authenticated endpoint and consumes no deployment or build quota, so testing a
 * connection costs the customer nothing.
 */
export async function verifyKey(token: string, signal?: AbortSignal): Promise<VercelResult<{ account: string }>> {
  try {
    const { status, body, retryAfter } = await providerGet(`${API}/v2/user`, bearer(token), signal);
    if (status !== 200) {
      return mapProviderStatus(status, {
        label: LABEL,
        retryAfter,
        forbidden: "Rejected by Vercel — the token may be scoped to a team this credential cannot read.",
      });
    }
    const user = body && typeof body === "object" ? (body as { user?: unknown }).user : null;
    const u = user && typeof user === "object" ? (user as Record<string, unknown>) : {};
    const account = typeof u.username === "string" ? u.username : typeof u.email === "string" ? u.email : "Connected";
    return { ok: true, account };
  } catch {
    return networkFailure(LABEL);
  }
}

/**
 * The domains this account owns. Used only to attribute discovered hostnames to
 * an account the customer controls — never to enumerate anything OUTSIDE did not
 * already find from the outside.
 */
export async function ownedDomains(token: string, signal?: AbortSignal): Promise<VercelResult<{ domains: string[] }>> {
  try {
    const { status, body, retryAfter } = await providerGet(`${API}/v5/domains?limit=${MAX_DOMAINS}`, bearer(token), signal);
    if (status !== 200) return mapProviderStatus(status, { label: LABEL, retryAfter });
    const list = body && typeof body === "object" ? (body as { domains?: unknown }).domains : null;
    const domains = Array.isArray(list)
      ? list
          .map((entry) => (entry && typeof entry === "object" ? (entry as { name?: unknown }).name : null))
          .filter((name): name is string => typeof name === "string" && name.length > 0)
          .map((name) => name.trim().toLowerCase())
      : [];
    return { ok: true, domains: [...new Set(domains)].slice(0, MAX_DOMAINS) };
  } catch {
    return networkFailure(LABEL);
  }
}

/**
 * Vercel tokens are opaque. Only obvious rubbish is rejected locally; the live
 * test is the real check.
 */
export function looksLikeVercelToken(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 20 && trimmed.length <= 200 && /^[A-Za-z0-9_-]+$/.test(trimmed);
}
