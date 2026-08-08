/**
 * Google Cloud — BYOK (bring your own key) adapter.
 *
 * Pure provider logic: no storage, no auth, no HTTP framework. Authentication is
 * the shared Google service-account exchange; only the scope and the Cloud DNS
 * calls are specific to this connector.
 *
 * Read-only. Attribution comes from Cloud DNS managed zones, which needs nothing
 * beyond the DNS Reader role — there is no reason for OUTSIDE to hold a
 * credential that can change Google Cloud resources.
 *
 * The private key stays in this process; only signatures leave it.
 */

import { providerGet, mapProviderStatus, networkFailure, type ProviderFailure } from "@/lib/integrations/providers/http";
import { accessToken, parseServiceAccount } from "./google-oauth";

const DNS_API = "https://dns.googleapis.com/dns/v1";
const SCOPE = "https://www.googleapis.com/auth/cloud-platform.read-only";
const LABEL = "Google Cloud";
const MAX_ZONES = 200;

export type GcpResult<T> = ({ ok: true } & T) | ProviderFailure;

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

async function managedZones(raw: string, signal?: AbortSignal): Promise<GcpResult<{ domains: string[]; project: string }>> {
  const account = parseServiceAccount(raw);
  if (!account) return { ok: false, code: "bad_format", message: "Paste the service-account JSON key file exactly as Google issued it." };
  if (!account.projectId) {
    return { ok: false, code: "bad_format", message: "The service-account key has no project_id, so there is no project to read Cloud DNS from." };
  }

  const token = await accessToken(account, SCOPE, LABEL, { signal });
  if (!token.ok) return token;

  try {
    const { status, body, retryAfter } = await providerGet(
      `${DNS_API}/projects/${encodeURIComponent(account.projectId)}/managedZones?maxResults=${MAX_ZONES}`,
      bearer(token.token),
      signal,
    );
    if (status !== 200) {
      return mapProviderStatus(status, {
        label: LABEL,
        retryAfter,
        forbidden: "Google Cloud accepted the service account but refused to list Cloud DNS zones — grant it the DNS Reader role on the project.",
      });
    }
    const zones = body && typeof body === "object" ? (body as { managedZones?: unknown }).managedZones : null;
    const domains = (Array.isArray(zones) ? zones : [])
      .map((zone) => (zone && typeof zone === "object" ? (zone as { dnsName?: unknown }).dnsName : null))
      .filter((name): name is string => typeof name === "string" && name.length > 0)
      // Cloud DNS returns fully-qualified names with a trailing dot.
      .map((name) => name.trim().toLowerCase().replace(/\.$/, ""))
      .filter((name) => name.length > 0);
    return { ok: true, domains: [...new Set(domains)].slice(0, MAX_ZONES), project: account.projectId };
  } catch {
    return networkFailure(LABEL);
  }
}

/** Prove the key works and report the project it reads. */
export async function verifyKey(raw: string, signal?: AbortSignal): Promise<GcpResult<{ account: string; zones: number }>> {
  const result = await managedZones(raw, signal);
  if (!result.ok) return result;
  const account = parseServiceAccount(raw)!;
  return { ok: true, account: `${account.clientEmail} · project ${result.project}`, zones: result.domains.length };
}

/** Cloud DNS zones, used only to attribute hostnames OUTSIDE already found. */
export async function ownedDomains(raw: string, signal?: AbortSignal): Promise<GcpResult<{ domains: string[] }>> {
  const result = await managedZones(raw, signal);
  return result.ok ? { ok: true, domains: result.domains } : result;
}
