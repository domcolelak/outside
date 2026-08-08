/**
 * Microsoft 365 — BYOK (bring your own key) adapter.
 *
 * Pure provider logic: no storage, no auth, no HTTP framework. Authentication is
 * the shared Microsoft client-credentials exchange; only the audience and the
 * Graph call are specific to this connector.
 *
 * Read-only, and the smallest useful permission: `Domain.Read.All` is enough to
 * list the tenant's accepted domains. That is precisely the attribution signal —
 * a hostname under a domain the tenant has verified belongs to the customer.
 *
 * Only VERIFIED domains are used. An unverified domain is one the tenant has
 * claimed but not yet proven, and attributing on that basis would assert
 * ownership the customer has not established.
 *
 * The secret is passed in explicitly (from the organization's encrypted
 * credential) and is never logged, returned, or placed in an error message.
 */

import { providerGet, mapProviderStatus, networkFailure, type ProviderFailure } from "@/lib/integrations/providers/http";
import { accessToken, splitMicrosoftCredential } from "./microsoft-oauth";

const GRAPH = "https://graph.microsoft.com/v1.0";
const SCOPE = "https://graph.microsoft.com/.default";
const LABEL = "Microsoft 365";
const MAX_DOMAINS = 200;

export type M365Result<T> = ({ ok: true } & T) | ProviderFailure;

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

async function domains(raw: string, signal?: AbortSignal): Promise<M365Result<{ verified: string[]; total: number }>> {
  const cred = splitMicrosoftCredential(raw);
  if (!cred) return { ok: false, code: "bad_format", message: "Enter the directory (tenant) ID, the application (client) ID and the client secret." };

  const token = await accessToken(cred, SCOPE, LABEL, signal);
  if (!token.ok) return token;

  try {
    const { status, body, retryAfter } = await providerGet(`${GRAPH}/domains`, bearer(token.token), signal);
    if (status !== 200) {
      return mapProviderStatus(status, {
        label: LABEL,
        retryAfter,
        forbidden: "Microsoft 365 accepted the application but refused to list domains — grant it the Domain.Read.All application permission and admin consent.",
      });
    }
    const value = body && typeof body === "object" ? (body as { value?: unknown }).value : null;
    const entries = Array.isArray(value) ? value : [];
    const verified = entries
      .filter((entry) => entry && typeof entry === "object" && (entry as { isVerified?: unknown }).isVerified === true)
      .map((entry) => (entry as { id?: unknown }).id)
      .filter((id): id is string => typeof id === "string" && id.length > 0)
      .map((id) => id.trim().toLowerCase());
    return { ok: true, verified: [...new Set(verified)].slice(0, MAX_DOMAINS), total: entries.length };
  } catch {
    return networkFailure(LABEL);
  }
}

/** Prove the credential works and report how much of the tenant it can see. */
export async function verifyKey(raw: string, signal?: AbortSignal): Promise<M365Result<{ account: string; verified: number; total: number }>> {
  const result = await domains(raw, signal);
  if (!result.ok) return result;
  const cred = splitMicrosoftCredential(raw)!;
  return { ok: true, account: `Tenant ${cred.tenantId}`, verified: result.verified.length, total: result.total };
}

/** Verified tenant domains, used only to attribute hostnames OUTSIDE already found. */
export async function ownedDomains(raw: string, signal?: AbortSignal): Promise<M365Result<{ domains: string[] }>> {
  const result = await domains(raw, signal);
  return result.ok ? { ok: true, domains: result.verified } : result;
}
