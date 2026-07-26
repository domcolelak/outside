/**
 * Have I Been Pwned — BYOK (bring your own key) adapter.
 *
 * Every request is server-side and carries both required headers: the customer's
 * API key and a user-agent (HIBP answers 403 without one). Status codes are
 * mapped to distinct, actionable results rather than a generic failure, because
 * they mean different things — 401 is a bad key, 403 is a missing user-agent /
 * insufficient plan / unverified domain, 404 is simply "no result", 429 is rate
 * limiting, 503 is HIBP being down.
 *
 * The key is passed in explicitly (from the organization's encrypted credential)
 * and is never logged, returned, or placed in an error message.
 */

const API = "https://haveibeenpwned.com/api/v3";
const TIMEOUT_MS = 12_000;

/** The user-agent HIBP requires; overridable but never secret. */
function userAgent(): string {
  return process.env.HIBP_USER_AGENT?.trim() || "OUTSIDE-Guardian";
}

export type HibpErrorCode = "invalid_key" | "forbidden" | "rate_limited" | "unavailable" | "network";
export interface HibpFailure {
  ok: false;
  code: HibpErrorCode;
  status?: number;
  /** Safe to show a user — never contains the key or raw provider payload. */
  message: string;
  retryAfterSeconds?: number;
}
export type HibpResult<T> = ({ ok: true } & T) | HibpFailure;

function fail(status: number, retryAfter?: string | null): HibpFailure {
  switch (status) {
    case 401: return { ok: false, code: "invalid_key", status, message: "The API key is invalid or expired." };
    case 403: return { ok: false, code: "forbidden", status, message: "Rejected by HIBP — the plan may not cover this, or the domain is not verified in HIBP." };
    case 429: return { ok: false, code: "rate_limited", status, message: "HIBP rate limit reached. Try again shortly.", retryAfterSeconds: retryAfter ? Number(retryAfter) || undefined : undefined };
    case 503: return { ok: false, code: "unavailable", status, message: "HIBP is temporarily unavailable." };
    default: return { ok: false, code: "unavailable", status, message: `HIBP returned an unexpected status (${status}).` };
  }
}

async function hibpGet(path: string, key: string, signal?: AbortSignal): Promise<{ status: number; body: unknown; retryAfter: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("HIBP request timed out.")), TIMEOUT_MS);
  const composed = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  try {
    const res = await fetch(`${API}${path}`, {
      headers: { "hibp-api-key": key, "user-agent": userAgent(), accept: "application/json" },
      signal: composed,
    });
    const retryAfter = res.headers.get("retry-after");
    if (res.status === 404) return { status: 404, body: null, retryAfter };
    const body = res.ok ? await res.json().catch(() => null) : null;
    return { status: res.status, body, retryAfter };
  } finally {
    clearTimeout(timer);
  }
}

export interface HibpSubscription {
  subscriptionName: string;
  domainSearchMaxBreachedAccounts: number | null;
  subscribedUntil: string | null;
}

/**
 * Prove the key works and read the subscription. This is the ONLY signal that a
 * connection is truly live — a stored key is not "connected" until this succeeds.
 */
export async function verifyKey(key: string, signal?: AbortSignal): Promise<HibpResult<{ subscription: HibpSubscription }>> {
  try {
    const { status, body, retryAfter } = await hibpGet("/subscription/status", key, signal);
    if (status === 200 && body && typeof body === "object") {
      const b = body as Record<string, unknown>;
      return {
        ok: true,
        subscription: {
          subscriptionName: typeof b.SubscriptionName === "string" ? b.SubscriptionName : "Unknown",
          domainSearchMaxBreachedAccounts: typeof b.DomainSearchMaxBreachedAccounts === "number" ? b.DomainSearchMaxBreachedAccounts : null,
          subscribedUntil: typeof b.SubscribedUntil === "string" ? b.SubscribedUntil : null,
        },
      };
    }
    return fail(status, retryAfter);
  } catch {
    return { ok: false, code: "network", message: "Could not reach HIBP." };
  }
}

/** The domains this key is allowed to search (verified in HIBP and within the plan). */
export async function subscribedDomains(key: string, signal?: AbortSignal): Promise<HibpResult<{ domains: string[] }>> {
  try {
    const { status, body, retryAfter } = await hibpGet("/subscribeddomains", key, signal);
    if (status === 200 && Array.isArray(body)) {
      const domains = body
        .map((entry) => (entry && typeof entry === "object" ? (entry as Record<string, unknown>).DomainName : null))
        .filter((name): name is string => typeof name === "string");
      return { ok: true, domains };
    }
    if (status === 404) return { ok: true, domains: [] };
    return fail(status, retryAfter);
  } catch {
    return { ok: false, code: "network", message: "Could not reach HIBP." };
  }
}

export interface DomainBreachAccount {
  alias: string;
  breaches: string[];
}

/**
 * Authenticated domain search: the breached accounts on a domain the key is
 * verified for. 404 means "no breached accounts found" — a legitimate clean
 * result, not an integration error. 403 means the domain is not verified in HIBP
 * or the plan does not allow it.
 */
export async function searchDomain(key: string, domain: string, signal?: AbortSignal): Promise<HibpResult<{ accounts: DomainBreachAccount[] }>> {
  try {
    const { status, body, retryAfter } = await hibpGet(`/breacheddomain/${encodeURIComponent(domain)}`, key, signal);
    if (status === 404) return { ok: true, accounts: [] };
    if (status === 200 && body && typeof body === "object") {
      const accounts = Object.entries(body as Record<string, unknown>).map(([alias, breaches]) => ({
        alias,
        breaches: Array.isArray(breaches) ? breaches.filter((b): b is string => typeof b === "string") : [],
      }));
      return { ok: true, accounts };
    }
    return fail(status, retryAfter);
  } catch {
    return { ok: false, code: "network", message: "Could not reach HIBP." };
  }
}

/** HIBP test keys are exactly 32 hex characters and only work on test endpoints. */
export function looksLikeHibpKey(value: string): boolean {
  return /^[a-f0-9]{32}$/i.test(value.trim());
}
