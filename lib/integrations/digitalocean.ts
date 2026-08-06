/**
 * DigitalOcean — BYOK (bring your own key) adapter.
 *
 * Pure provider logic: no storage, no auth, no HTTP framework. The token travels
 * as a bearer credential. Read-only: this connector attributes discovered
 * hostnames to domains the account owns, and never writes to the account.
 *
 * A read-scoped token is enough, and is what the connector asks for — there is
 * no reason for OUTSIDE to hold a credential that can create or destroy
 * infrastructure.
 *
 * The token is passed in explicitly (from the organization's encrypted
 * credential) and is never logged, returned, or placed in an error message.
 */

import { providerGet, mapProviderStatus, networkFailure, type ProviderFailure } from "@/lib/integrations/providers/http";

const API = "https://api.digitalocean.com/v2";
const LABEL = "DigitalOcean";
const MAX_DOMAINS = 200;

export type DigitalOceanResult<T> = ({ ok: true } & T) | ProviderFailure;

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

/** Prove the token works and read the account it belongs to. Consumes no quota. */
export async function verifyKey(token: string, signal?: AbortSignal): Promise<DigitalOceanResult<{ account: string }>> {
  try {
    const { status, body, retryAfter } = await providerGet(`${API}/account`, bearer(token), signal);
    if (status !== 200) {
      return mapProviderStatus(status, {
        label: LABEL,
        retryAfter,
        forbidden: "Rejected by DigitalOcean — the token may lack read access to the account.",
      });
    }
    const account = body && typeof body === "object" ? (body as { account?: unknown }).account : null;
    const a = account && typeof account === "object" ? (account as Record<string, unknown>) : {};
    return { ok: true, account: typeof a.email === "string" ? a.email : "Connected" };
  } catch {
    return networkFailure(LABEL);
  }
}

/** Domains this account owns, used only to attribute already-discovered hostnames. */
export async function ownedDomains(token: string, signal?: AbortSignal): Promise<DigitalOceanResult<{ domains: string[] }>> {
  try {
    const { status, body, retryAfter } = await providerGet(`${API}/domains?per_page=${MAX_DOMAINS}`, bearer(token), signal);
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

/** DigitalOcean tokens are long opaque strings; the live test is the real check. */
export function looksLikeDigitalOceanToken(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 32 && trimmed.length <= 200 && /^[A-Za-z0-9_-]+$/.test(trimmed);
}
