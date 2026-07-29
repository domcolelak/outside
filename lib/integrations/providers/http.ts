/**
 * Shared HTTP + error mapping for provider adapters.
 *
 * Every adapter needs the same three things: a bounded request, the raw status
 * back so it can apply its own success semantics (some providers use 404 to mean
 * "no result" rather than an error), and a consistent translation of failure
 * statuses into the normalized taxonomy. Centralising it keeps the adapters to
 * genuinely provider-specific logic instead of five copies of the same
 * boilerplate drifting apart.
 */

import type { ProviderErrorCode } from "./types";

const DEFAULT_TIMEOUT_MS = 12_000;

export interface ProviderResponse {
  status: number;
  body: unknown;
  retryAfter: string | null;
}

export interface ProviderFailure {
  ok: false;
  code: ProviderErrorCode;
  status?: number;
  /** Safe to show a user — never contains the credential or a raw payload. */
  message: string;
  retryAfterSeconds?: number;
}

/**
 * A bounded GET. Returns the status rather than throwing on it, so each adapter
 * decides what counts as success. Only transport failures throw.
 */
export async function providerGet(
  url: string,
  headers: Record<string, string>,
  signal?: AbortSignal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<ProviderResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Provider request timed out.")), timeoutMs);
  const composed = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  try {
    const res = await fetch(url, { headers: { accept: "application/json", ...headers }, signal: composed });
    const retryAfter = res.headers.get("retry-after");
    const body = res.ok ? await res.json().catch(() => null) : null;
    return { status: res.status, body, retryAfter };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Translate a failure status into the normalized taxonomy. `label` names the
 * provider in the user-facing message; `forbidden` lets an adapter explain what
 * a 403 means for that specific provider (plan, scope, unverified target…).
 */
export function mapProviderStatus(
  status: number,
  options: { label: string; retryAfter?: string | null; forbidden?: string },
): ProviderFailure {
  const { label, retryAfter, forbidden } = options;
  switch (status) {
    case 401:
    case 403:
      if (status === 401) return { ok: false, code: "invalid_key", status, message: "The API key is invalid or expired." };
      return { ok: false, code: "forbidden", status, message: forbidden ?? `Rejected by ${label} — your plan may not cover this request.` };
    case 429:
      return {
        ok: false,
        code: "rate_limited",
        status,
        message: `${label} quota or rate limit reached.`,
        retryAfterSeconds: retryAfter ? Number(retryAfter) || undefined : undefined,
      };
    default:
      if (status >= 500) return { ok: false, code: "unavailable", status, message: `${label} is temporarily unavailable.` };
      return { ok: false, code: "unknown", status, message: `${label} returned an unexpected status (${status}).` };
  }
}

/** The standard transport-failure result, used when a request never completed. */
export function networkFailure(label: string): ProviderFailure {
  return { ok: false, code: "network", message: `Could not reach ${label}.` };
}
