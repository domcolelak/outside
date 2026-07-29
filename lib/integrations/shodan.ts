/**
 * Shodan — BYOK (bring your own key) adapter.
 *
 * Pure provider logic: no storage, no auth, no HTTP framework. Shodan
 * authenticates with the key as a query parameter rather than a header, which is
 * the one genuinely provider-specific thing here.
 *
 * The key is passed in explicitly (from the organization's encrypted credential)
 * and is never logged, returned, or placed in an error message.
 */

import { providerGet, mapProviderStatus, networkFailure, type ProviderFailure } from "@/lib/integrations/providers/http";

const API = "https://api.shodan.io";
const LABEL = "Shodan";

export interface ShodanPlan {
  plan: string | null;
  /** Credits for on-demand scans; null when the plan does not report them. */
  scanCredits: number | null;
  /** Credits for search queries; null when the plan does not report them. */
  queryCredits: number | null;
}

export type ShodanResult<T> = ({ ok: true } & T) | ProviderFailure;

function url(path: string, key: string): string {
  return `${API}${path}?key=${encodeURIComponent(key)}`;
}

/**
 * Prove the key works and read the plan. /api-info is the canonical account
 * endpoint and does not consume scan or query credits, so testing a connection
 * costs the customer nothing.
 */
export async function verifyKey(key: string, signal?: AbortSignal): Promise<ShodanResult<{ plan: ShodanPlan }>> {
  try {
    const { status, body, retryAfter } = await providerGet(url("/api-info", key), {}, signal);
    if (status === 200 && body && typeof body === "object") {
      const b = body as Record<string, unknown>;
      return {
        ok: true,
        plan: {
          plan: typeof b.plan === "string" ? b.plan : null,
          scanCredits: typeof b.scan_credits === "number" ? b.scan_credits : null,
          queryCredits: typeof b.query_credits === "number" ? b.query_credits : null,
        },
      };
    }
    return mapProviderStatus(status, { label: LABEL, retryAfter });
  } catch {
    return networkFailure(LABEL);
  }
}

/**
 * A Shodan key is a 32-character alphanumeric string. The live test remains the
 * real check; this only rejects obvious rubbish before any network call.
 */
export function looksLikeShodanKey(value: string): boolean {
  return /^[A-Za-z0-9]{32}$/.test(value.trim());
}
