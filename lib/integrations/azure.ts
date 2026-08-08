/**
 * Azure — BYOK (bring your own key) adapter.
 *
 * Pure provider logic: no storage, no auth, no HTTP framework. Authentication is
 * the shared Microsoft client-credentials exchange; only the audience and the
 * resource calls are Azure-specific.
 *
 * Read-only. Attribution comes from Azure DNS zones, which needs nothing more
 * than the Reader role on the subscriptions the customer wants covered — there
 * is no reason for OUTSIDE to hold a credential that can change Azure resources.
 *
 * The secret is passed in explicitly (from the organization's encrypted
 * credential) and is never logged, returned, or placed in an error message.
 */

import { providerGet, mapProviderStatus, networkFailure, type ProviderFailure } from "@/lib/integrations/providers/http";
import { accessToken, splitMicrosoftCredential } from "./microsoft-oauth";

const ARM = "https://management.azure.com";
const SCOPE = "https://management.azure.com/.default";
const LABEL = "Azure";
/** Bounded: attribution must stay cheap regardless of tenant size. */
const MAX_SUBSCRIPTIONS = 10;
const MAX_ZONES = 200;

export type AzureResult<T> = ({ ok: true } & T) | ProviderFailure;

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

/**
 * Prove the credential works and count what it can see. Listing subscriptions
 * needs only a directory-level read, so this separates "the app registration is
 * wrong" from "the app has no role assignment yet".
 */
export async function verifyKey(raw: string, signal?: AbortSignal): Promise<AzureResult<{ account: string; subscriptions: number }>> {
  const cred = splitMicrosoftCredential(raw);
  if (!cred) return { ok: false, code: "bad_format", message: "Enter the directory (tenant) ID, the application (client) ID and the client secret." };

  const token = await accessToken(cred, SCOPE, LABEL, signal);
  if (!token.ok) return token;

  try {
    const { status, body, retryAfter } = await providerGet(`${ARM}/subscriptions?api-version=2020-01-01`, bearer(token.token), signal);
    if (status !== 200) {
      return mapProviderStatus(status, {
        label: LABEL,
        retryAfter,
        forbidden: "Azure accepted the application but refused to list subscriptions — assign it the Reader role on the subscriptions you want covered.",
      });
    }
    const list = body && typeof body === "object" ? (body as { value?: unknown }).value : null;
    const subscriptions = Array.isArray(list) ? list.length : 0;
    return { ok: true, account: `Tenant ${cred.tenantId}`, subscriptions };
  } catch {
    return networkFailure(LABEL);
  }
}

/**
 * DNS zones across the subscriptions this application can read. Bounded to
 * MAX_SUBSCRIPTIONS so a large tenant cannot turn attribution into a crawl.
 */
export async function ownedDomains(raw: string, signal?: AbortSignal): Promise<AzureResult<{ domains: string[] }>> {
  const cred = splitMicrosoftCredential(raw);
  if (!cred) return { ok: false, code: "bad_format", message: "Enter the directory (tenant) ID, the application (client) ID and the client secret." };

  const token = await accessToken(cred, SCOPE, LABEL, signal);
  if (!token.ok) return token;

  try {
    const subs = await providerGet(`${ARM}/subscriptions?api-version=2020-01-01`, bearer(token.token), signal);
    if (subs.status !== 200) {
      return mapProviderStatus(subs.status, {
        label: LABEL,
        retryAfter: subs.retryAfter,
        forbidden: "Azure refused to list subscriptions — the application needs the Reader role.",
      });
    }
    const list = subs.body && typeof subs.body === "object" ? (subs.body as { value?: unknown }).value : null;
    const ids = (Array.isArray(list) ? list : [])
      .map((entry) => (entry && typeof entry === "object" ? (entry as { subscriptionId?: unknown }).subscriptionId : null))
      .filter((id): id is string => typeof id === "string")
      .slice(0, MAX_SUBSCRIPTIONS);

    const domains = new Set<string>();
    for (const id of ids) {
      const zones = await providerGet(
        `${ARM}/subscriptions/${encodeURIComponent(id)}/providers/Microsoft.Network/dnszones?api-version=2018-05-01`,
        bearer(token.token),
        signal,
      );
      if (zones.status !== 200 || !zones.body || typeof zones.body !== "object") continue;
      const value = (zones.body as { value?: unknown }).value;
      for (const zone of Array.isArray(value) ? value : []) {
        const name = zone && typeof zone === "object" ? (zone as { name?: unknown }).name : null;
        if (typeof name === "string" && name) domains.add(name.trim().toLowerCase());
        if (domains.size >= MAX_ZONES) break;
      }
      if (domains.size >= MAX_ZONES) break;
    }

    return { ok: true, domains: [...domains] };
  } catch {
    return networkFailure(LABEL);
  }
}
