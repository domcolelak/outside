/**
 * Netlify — BYOK (bring your own key) adapter.
 *
 * Pure provider logic: no storage, no auth, no HTTP framework. The token travels
 * as a bearer credential. Read-only: this connector attributes discovered
 * hostnames to DNS zones the account owns, and never writes to the account.
 *
 * The token is passed in explicitly (from the organization's encrypted
 * credential) and is never logged, returned, or placed in an error message.
 */

import { providerGet, mapProviderStatus, networkFailure, type ProviderFailure } from "@/lib/integrations/providers/http";

const API = "https://api.netlify.com/api/v1";
const LABEL = "Netlify";
const MAX_ZONES = 200;

export type NetlifyResult<T> = ({ ok: true } & T) | ProviderFailure;

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

/** Prove the token works and read who it belongs to. /user costs no build minutes. */
export async function verifyKey(token: string, signal?: AbortSignal): Promise<NetlifyResult<{ account: string }>> {
  try {
    const { status, body, retryAfter } = await providerGet(`${API}/user`, bearer(token), signal);
    if (status !== 200) {
      return mapProviderStatus(status, {
        label: LABEL,
        retryAfter,
        forbidden: "Rejected by Netlify — the token may lack access to this account.",
      });
    }
    const u = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const account = typeof u.full_name === "string" && u.full_name ? u.full_name : typeof u.email === "string" ? u.email : "Connected";
    return { ok: true, account };
  } catch {
    return networkFailure(LABEL);
  }
}

/** DNS zones this account owns, used only to attribute already-discovered hostnames. */
export async function ownedDomains(token: string, signal?: AbortSignal): Promise<NetlifyResult<{ domains: string[] }>> {
  try {
    const { status, body, retryAfter } = await providerGet(`${API}/dns_zones`, bearer(token), signal);
    if (status !== 200) return mapProviderStatus(status, { label: LABEL, retryAfter });
    const domains = Array.isArray(body)
      ? body
          .map((zone) => (zone && typeof zone === "object" ? (zone as { name?: unknown }).name : null))
          .filter((name): name is string => typeof name === "string" && name.length > 0)
          .map((name) => name.trim().toLowerCase())
      : [];
    return { ok: true, domains: [...new Set(domains)].slice(0, MAX_ZONES) };
  } catch {
    return networkFailure(LABEL);
  }
}

/** Netlify personal access tokens are opaque; the live test is the real check. */
export function looksLikeNetlifyToken(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 20 && trimmed.length <= 200 && /^[A-Za-z0-9_-]+$/.test(trimmed);
}
