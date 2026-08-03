/**
 * AbuseIPDB — BYOK (bring your own key) adapter.
 *
 * Pure provider logic: no storage, no auth, no HTTP framework. The key travels
 * in the `Key` header.
 *
 * AbuseIPDB has no free "ping" endpoint, so a connection test performs the
 * cheapest real request — a check of a well-known public resolver — which costs
 * one of the plan's daily requests. The remaining daily allowance is reported
 * back from the rate-limit headers, which is also how capability is detected.
 * The provider definition rejects Free/Individual limits because AbuseIPDB's
 * terms prohibit those plans from commercial use.
 *
 * The key is passed in explicitly (from the organization's encrypted credential)
 * and is never logged, returned, or placed in an error message.
 */

import { mapProviderStatus, networkFailure, type ProviderFailure } from "@/lib/integrations/providers/http";

const API = "https://api.abuseipdb.com/api/v2";
const LABEL = "AbuseIPDB";
const TIMEOUT_MS = 12_000;
/** A stable, well-known public resolver — a harmless subject for a connection test. */
const PROBE_IP = "8.8.8.8";

export interface AbuseQuota {
  /** Requests left in the current daily window, when the provider reports it. */
  remaining: number | null;
  /** Daily allowance, when the provider reports it. */
  limit: number | null;
}

export type AbuseResult<T> = ({ ok: true } & T) | ProviderFailure;

/**
 * Prove the key works and read the remaining daily allowance. The quota lives in
 * response headers, so this does not use the shared JSON helper.
 */
export async function verifyKey(key: string, signal?: AbortSignal): Promise<AbuseResult<{ quota: AbuseQuota }>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("AbuseIPDB request timed out.")), TIMEOUT_MS);
  const composed = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  try {
    const res = await fetch(`${API}/check?ipAddress=${PROBE_IP}&maxAgeInDays=90`, {
      headers: { Key: key, accept: "application/json" },
      signal: composed,
    });
    const remaining = Number(res.headers.get("x-ratelimit-remaining"));
    const limit = Number(res.headers.get("x-ratelimit-limit"));
    const quota: AbuseQuota = {
      remaining: Number.isFinite(remaining) && res.headers.has("x-ratelimit-remaining") ? remaining : null,
      limit: Number.isFinite(limit) && res.headers.has("x-ratelimit-limit") ? limit : null,
    };
    if (res.ok) return { ok: true, quota };
    return mapProviderStatus(res.status, {
      label: LABEL,
      retryAfter: res.headers.get("retry-after"),
      forbidden: "Rejected by AbuseIPDB — the key may lack permission for this endpoint.",
    });
  } catch {
    return networkFailure(LABEL);
  } finally {
    clearTimeout(timer);
  }
}

/** An AbuseIPDB key is an 80-character lowercase hex string. */
export function looksLikeAbuseIpdbKey(value: string): boolean {
  return /^[a-f0-9]{80}$/i.test(value.trim());
}
