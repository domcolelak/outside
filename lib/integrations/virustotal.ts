/**
 * VirusTotal — BYOK (bring your own key) adapter.
 *
 * Pure provider logic: no storage, no auth, no HTTP framework. The key travels
 * in the `x-apikey` header.
 *
 * Licensing note: VirusTotal's free Public API is not licensed for use in
 * commercial products or services. The provider definition therefore rejects
 * keys unless VirusTotal exposes a privileged entitlement; a technically valid
 * free key is never treated as production-ready or persisted by OUTSIDE.
 *
 * The key is passed in explicitly (from the organization's encrypted credential)
 * and is never logged, returned, or placed in an error message.
 */

import { providerGet, mapProviderStatus, networkFailure, type ProviderFailure } from "@/lib/integrations/providers/http";

const API = "https://www.virustotal.com/api/v3";
const LABEL = "VirusTotal";

export interface VirusTotalAccount {
  /** The plan name VirusTotal reports, when it reports one. */
  plan: string | null;
  /** Daily API allowance and usage, when the plan reports them. */
  dailyAllowed: number | null;
  dailyUsed: number | null;
  /** True when VirusTotal confirms a privileged (non-free) entitlement. */
  privileged: boolean;
}

export type VirusTotalResult<T> = ({ ok: true } & T) | ProviderFailure;

function attributesOf(body: unknown): Record<string, unknown> | null {
  const data = body && typeof body === "object" ? (body as { data?: unknown }).data : null;
  const attrs = data && typeof data === "object" ? (data as { attributes?: unknown }).attributes : null;
  return attrs && typeof attrs === "object" ? (attrs as Record<string, unknown>) : null;
}

/**
 * VirusTotal exposes the caller's own account under /users/{id}, where the API
 * key itself is a valid identifier. A 200 proves the key works.
 */
export async function verifyKey(key: string, signal?: AbortSignal): Promise<VirusTotalResult<{ account: VirusTotalAccount }>> {
  try {
    const { status, body, retryAfter } = await providerGet(`${API}/users/${encodeURIComponent(key)}`, { "x-apikey": key }, signal);
    if (status !== 200) {
      return mapProviderStatus(status, {
        label: LABEL,
        retryAfter,
        forbidden: "Rejected by VirusTotal — the key may not have access to this endpoint.",
      });
    }

    const attrs = attributesOf(body) ?? {};
    // Privileges are reported as a map of entitlement -> { granted: boolean }.
    const privileges = attrs.privileges && typeof attrs.privileges === "object" ? (attrs.privileges as Record<string, unknown>) : {};
    const privileged = Object.values(privileges).some(
      (entry) => entry && typeof entry === "object" && (entry as { granted?: unknown }).granted === true,
    );

    const quotas = await accountQuota(key, signal);
    return {
      ok: true,
      account: {
        plan: typeof attrs.user_type === "string" ? attrs.user_type : null,
        dailyAllowed: quotas.ok ? quotas.allowed : null,
        dailyUsed: quotas.ok ? quotas.used : null,
        privileged,
      },
    };
  } catch {
    return networkFailure(LABEL);
  }
}

/** Daily API request allowance. Missing quota data is reported as unknown, not zero. */
async function accountQuota(key: string, signal?: AbortSignal): Promise<{ ok: true; allowed: number | null; used: number | null } | { ok: false }> {
  try {
    const { status, body } = await providerGet(`${API}/users/${encodeURIComponent(key)}/overall_quotas`, { "x-apikey": key }, signal);
    if (status !== 200 || !body || typeof body !== "object") return { ok: false };
    const data = (body as { data?: unknown }).data;
    const daily = data && typeof data === "object" ? (data as Record<string, unknown>).api_requests_daily : null;
    const user = daily && typeof daily === "object" ? (daily as Record<string, unknown>).user : null;
    if (!user || typeof user !== "object") return { ok: true, allowed: null, used: null };
    const u = user as Record<string, unknown>;
    return {
      ok: true,
      allowed: typeof u.allowed === "number" ? u.allowed : null,
      used: typeof u.used === "number" ? u.used : null,
    };
  } catch {
    return { ok: false };
  }
}

/** A VirusTotal API key is a 64-character lowercase hex string. */
export function looksLikeVirusTotalKey(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value.trim());
}
