/**
 * Censys — BYOK (bring your own key) adapter.
 *
 * Pure provider logic: no storage, no auth, no HTTP framework. Censys is the one
 * provider that authenticates with a PAIR — an API ID and an API secret, sent as
 * HTTP basic auth. The two are stored as a single encrypted value joined by a
 * colon, which is unambiguous because a Censys API ID is a UUID and contains no
 * colon.
 *
 * Neither half is ever logged, returned, or placed in an error message.
 */

import { mapProviderStatus, networkFailure, type ProviderFailure } from "@/lib/integrations/providers/http";
import { joinCredentialPair, splitCredentialPair } from "@/lib/integrations/pair-credential";

const API = "https://search.censys.io/api/v1";
const LABEL = "Censys";
const TIMEOUT_MS = 12_000;

export interface CensysAccount {
  /** Queries used in the current period, when Censys reports them. */
  used: number | null;
  /** Query allowance for the period, when Censys reports it. */
  allowance: number | null;
}

export type CensysResult<T> = ({ ok: true } & T) | ProviderFailure;

/**
 * The pair format is shared with the browser, which assembles the credential
 * before sending it — so it is defined once in lib/integrations/pair-credential
 * rather than here, where a client bundle could not import it.
 */
export const splitCensysCredential = splitCredentialPair;
export const joinCensysCredential = joinCredentialPair;

/**
 * Prove the pair works and read the query allowance. /account is the cheapest
 * authenticated endpoint and does not consume the query quota, so testing a
 * connection costs the customer nothing.
 */
export async function verifyKey(raw: string, signal?: AbortSignal): Promise<CensysResult<{ account: CensysAccount }>> {
  const pair = splitCensysCredential(raw);
  if (!pair) {
    return { ok: false, code: "bad_format", message: "Enter both the Censys API ID and the API secret." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Censys request timed out.")), TIMEOUT_MS);
  const composed = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  try {
    const res = await fetch(`${API}/account`, {
      headers: {
        authorization: `Basic ${Buffer.from(`${pair.id}:${pair.secret}`).toString("base64")}`,
        accept: "application/json",
      },
      signal: composed,
    });
    if (!res.ok) {
      return mapProviderStatus(res.status, {
        label: LABEL,
        retryAfter: res.headers.get("retry-after"),
        forbidden: "Rejected by Censys — the credential may not cover the Search API.",
      });
    }
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    const quota = body && typeof body.quota === "object" && body.quota ? (body.quota as Record<string, unknown>) : {};
    return {
      ok: true,
      account: {
        used: typeof quota.used === "number" ? quota.used : null,
        allowance: typeof quota.allowance === "number" ? quota.allowance : null,
      },
    };
  } catch {
    return networkFailure(LABEL);
  } finally {
    clearTimeout(timer);
  }
}

/** Both halves must be present; the live test is the real check. */
export function looksLikeCensysCredential(value: string): boolean {
  const pair = splitCensysCredential(value);
  return !!pair && pair.id.length >= 8 && pair.secret.length >= 8;
}
