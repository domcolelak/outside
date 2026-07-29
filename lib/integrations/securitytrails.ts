/**
 * SecurityTrails — BYOK (bring your own key) adapter.
 *
 * Pure provider logic: no storage, no auth, no HTTP framework. Every request is
 * server-side and carries the customer's key in the `apikey` header. Status
 * codes are mapped to the shared normalized taxonomy, because they mean
 * different things — 401 is a bad key, 403 is a plan restriction, 429 is the
 * monthly quota or rate limit, 5xx is SecurityTrails being down.
 *
 * The key is passed in explicitly (from the organization's encrypted credential)
 * and is never logged, returned, or placed in an error message.
 */

import type { ProviderErrorCode } from "@/lib/integrations/providers/types";

const API = "https://api.securitytrails.com/v1";
const TIMEOUT_MS = 12_000;

export interface StFailure {
  ok: false;
  code: ProviderErrorCode;
  status?: number;
  /** Safe to show a user — never contains the key or raw provider payload. */
  message: string;
  retryAfterSeconds?: number;
}
export type StResult<T> = ({ ok: true } & T) | StFailure;

function fail(status: number, retryAfter?: string | null): StFailure {
  switch (status) {
    case 401: return { ok: false, code: "invalid_key", status, message: "The API key is invalid or expired." };
    case 403: return { ok: false, code: "forbidden", status, message: "Rejected by SecurityTrails — your plan may not cover this request." };
    case 429: return { ok: false, code: "rate_limited", status, message: "SecurityTrails quota or rate limit reached.", retryAfterSeconds: retryAfter ? Number(retryAfter) || undefined : undefined };
    default:
      if (status >= 500) return { ok: false, code: "unavailable", status, message: "SecurityTrails is temporarily unavailable." };
      return { ok: false, code: "unknown", status, message: `SecurityTrails returned an unexpected status (${status}).` };
  }
}

async function stGet(path: string, key: string, signal?: AbortSignal): Promise<{ status: number; body: unknown; retryAfter: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("SecurityTrails request timed out.")), TIMEOUT_MS);
  const composed = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  try {
    const res = await fetch(`${API}${path}`, { headers: { apikey: key, accept: "application/json" }, signal: composed });
    const retryAfter = res.headers.get("retry-after");
    const body = res.ok ? await res.json().catch(() => null) : null;
    return { status: res.status, body, retryAfter };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Prove the key works. /ping is the cheapest authenticated endpoint and does not
 * consume the monthly query quota, so testing a connection costs the customer
 * nothing.
 */
export async function verifyKey(key: string, signal?: AbortSignal): Promise<{ ok: true } | StFailure> {
  try {
    const { status, body, retryAfter } = await stGet("/ping", key, signal);
    if (status === 200 && body && typeof body === "object" && (body as { success?: unknown }).success !== false) {
      return { ok: true };
    }
    return fail(status, retryAfter);
  } catch {
    return { ok: false, code: "network", message: "Could not reach SecurityTrails." };
  }
}

export interface StUsage {
  /** Queries used this month, when the plan reports it. */
  used: number | null;
  /** Monthly allowance, when the plan reports it. */
  allowed: number | null;
}

/** Remaining monthly allowance — drives the capability shown on the connector. */
export async function accountUsage(key: string, signal?: AbortSignal): Promise<StResult<{ usage: StUsage }>> {
  try {
    const { status, body, retryAfter } = await stGet("/account/usage", key, signal);
    if (status === 200 && body && typeof body === "object") {
      const b = body as Record<string, unknown>;
      return {
        ok: true,
        usage: {
          used: typeof b.current_monthly_usage === "number" ? b.current_monthly_usage : null,
          allowed: typeof b.allowed_monthly_usage === "number" ? b.allowed_monthly_usage : null,
        },
      };
    }
    return fail(status, retryAfter);
  } catch {
    return { ok: false, code: "network", message: "Could not reach SecurityTrails." };
  }
}

/**
 * A SecurityTrails key is an opaque alphanumeric string. Only obvious rubbish is
 * rejected locally — the live test is the real check, and being too strict here
 * would reject valid keys if the format ever changes.
 */
export function looksLikeSecurityTrailsKey(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 16 && trimmed.length <= 128 && /^[A-Za-z0-9_-]+$/.test(trimmed);
}
