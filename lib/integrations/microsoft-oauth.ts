/**
 * Microsoft identity platform — client-credentials token exchange.
 *
 * Azure and Microsoft 365 are the same authentication story with a different
 * audience, so the exchange lives here once rather than being copied into both
 * adapters and drifting.
 *
 * The secret is sent to Microsoft's token endpoint and nowhere else. It is never
 * logged, returned, or placed in an error message, and the access token it buys
 * is kept in memory for the life of a single request — never stored.
 */

import { mapProviderStatus, networkFailure, type ProviderFailure } from "@/lib/integrations/providers/http";
import { splitCredentialParts } from "@/lib/integrations/pair-credential";

const LOGIN = "https://login.microsoftonline.com";
const TIMEOUT_MS = 12_000;
const MAX_BYTES = 200_000;

export interface MicrosoftCredential {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

/** Split the stored three-part credential. Only the secret may contain colons. */
export function splitMicrosoftCredential(raw: string): MicrosoftCredential | null {
  const parts = splitCredentialParts(raw, 3);
  if (!parts) return null;
  const [tenantId, clientId, clientSecret] = parts as [string, string, string];
  return { tenantId, clientId, clientSecret };
}

/** Tenant and application identifiers are GUIDs; the secret is opaque. */
export function looksLikeMicrosoftCredential(value: string): boolean {
  const cred = splitMicrosoftCredential(value);
  if (!cred) return false;
  const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return guid.test(cred.tenantId) && guid.test(cred.clientId) && cred.clientSecret.length >= 8;
}

/**
 * Exchange the application credential for an access token scoped to one
 * audience. A failure here is always the credential or the app registration —
 * never a missing API permission, which shows up later on the resource call.
 */
export async function accessToken(
  cred: MicrosoftCredential,
  scope: string,
  label: string,
  signal?: AbortSignal,
): Promise<{ ok: true; token: string } | ProviderFailure> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Microsoft token request timed out.")), TIMEOUT_MS);
  const composed = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  try {
    const res = await fetch(`${LOGIN}/${encodeURIComponent(cred.tenantId)}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: cred.clientId,
        client_secret: cred.clientSecret,
        scope,
      }).toString(),
      signal: composed,
    });

    if (!res.ok) {
      return mapProviderStatus(res.status, {
        label,
        retryAfter: res.headers.get("retry-after"),
        forbidden: `Rejected by ${label} — check the application registration, its secret, and that the secret has not expired.`,
      });
    }

    const text = (await res.text()).slice(0, MAX_BYTES);
    const body = JSON.parse(text) as { access_token?: unknown };
    if (typeof body.access_token !== "string" || !body.access_token) {
      return { ok: false, code: "unknown", message: `${label} returned no access token.` };
    }
    return { ok: true, token: body.access_token };
  } catch {
    return networkFailure(label);
  } finally {
    clearTimeout(timer);
  }
}
