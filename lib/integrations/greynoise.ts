/**
 * GreyNoise — BYOK (bring your own key) adapter.
 *
 * Pure provider logic: no storage, no auth, no HTTP framework. The key travels
 * in the `key` header.
 *
 * A connection test queries the same Community endpoint the scan uses, against a
 * well-known public resolver. A 404 there means "this IP was never observed",
 * which still proves the key authenticated — so it counts as a successful test,
 * not a failure.
 *
 * The key is passed in explicitly (from the organization's encrypted credential)
 * and is never logged, returned, or placed in an error message.
 */

import { providerGet, mapProviderStatus, networkFailure, type ProviderFailure } from "@/lib/integrations/providers/http";

const API = "https://api.greynoise.io/v3/community";
const LABEL = "GreyNoise";
/** A stable, well-known public resolver — a harmless subject for a connection test. */
const PROBE_IP = "8.8.8.8";

export type GreyNoiseResult<T> = ({ ok: true } & T) | ProviderFailure;

/**
 * Prove the key works. Both 200 and 404 confirm authentication; only an explicit
 * auth or transport failure means the key is unusable.
 */
export async function verifyKey(key: string, signal?: AbortSignal): Promise<GreyNoiseResult<Record<string, unknown>>> {
  try {
    const { status, retryAfter } = await providerGet(`${API}/${PROBE_IP}`, { key }, signal);
    if (status === 200 || status === 404) return { ok: true };
    return mapProviderStatus(status, {
      label: LABEL,
      retryAfter,
      forbidden: "Rejected by GreyNoise — the Community API may not be included in your plan.",
    });
  } catch {
    return networkFailure(LABEL);
  }
}

/**
 * A GreyNoise key is an opaque string. Only obvious rubbish is rejected locally;
 * the live test is the real check.
 */
export function looksLikeGreyNoiseKey(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 16 && trimmed.length <= 128 && /^[A-Za-z0-9_.-]+$/.test(trimmed);
}
