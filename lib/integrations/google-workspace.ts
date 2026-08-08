/**
 * Google Workspace — BYOK (bring your own key) adapter.
 *
 * Pure provider logic: no storage, no auth, no HTTP framework. Authentication is
 * the shared Google service-account exchange, with one difference that matters:
 * directory data belongs to an administrator, not to the service account, so the
 * assertion must impersonate one. That requires domain-wide delegation, granted
 * by a Workspace super administrator.
 *
 * The admin to impersonate is stored alongside the key, because a service
 * account alone cannot read the directory and a connector that silently fails
 * for that reason would be impossible for a customer to debug.
 *
 * Read-only: the scope is the read-only directory scope, and only VERIFIED
 * domains are used for attribution — an unverified domain is claimed rather than
 * proven.
 */

import { providerGet, mapProviderStatus, networkFailure, type ProviderFailure } from "@/lib/integrations/providers/http";
import { accessToken, parseServiceAccount } from "./google-oauth";

const DIRECTORY_API = "https://admin.googleapis.com/admin/directory/v1";
const SCOPE = "https://www.googleapis.com/auth/admin.directory.domain.readonly";
const LABEL = "Google Workspace";
const MAX_DOMAINS = 200;

export type WorkspaceResult<T> = ({ ok: true } & T) | ProviderFailure;

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

/**
 * The stored credential is the admin address, a newline, then the JSON key. A
 * newline separator keeps the JSON untouched, which matters because the customer
 * pastes it verbatim.
 */
export function splitWorkspaceCredential(raw: string): { adminEmail: string; keyJson: string } | null {
  const newline = raw.indexOf("\n");
  if (newline <= 0) return null;
  const adminEmail = raw.slice(0, newline).trim();
  const keyJson = raw.slice(newline + 1).trim();
  if (!adminEmail.includes("@") || !keyJson) return null;
  return { adminEmail, keyJson };
}

export function looksLikeWorkspaceCredential(value: string): boolean {
  const split = splitWorkspaceCredential(value);
  return !!split && parseServiceAccount(split.keyJson) !== null;
}

async function domains(raw: string, signal?: AbortSignal): Promise<WorkspaceResult<{ verified: string[]; total: number; admin: string }>> {
  const split = splitWorkspaceCredential(raw);
  if (!split) {
    return { ok: false, code: "bad_format", message: "Enter the administrator address to impersonate, then paste the service-account JSON key." };
  }
  const account = parseServiceAccount(split.keyJson);
  if (!account) return { ok: false, code: "bad_format", message: "Paste the service-account JSON key file exactly as Google issued it." };

  const token = await accessToken(account, SCOPE, LABEL, { subject: split.adminEmail, signal });
  if (!token.ok) return token;

  try {
    const { status, body, retryAfter } = await providerGet(
      `${DIRECTORY_API}/customer/my_customer/domains`,
      bearer(token.token),
      signal,
    );
    if (status !== 200) {
      return mapProviderStatus(status, {
        label: LABEL,
        retryAfter,
        forbidden: "Google Workspace refused to list domains — grant the client the admin.directory.domain.readonly scope through domain-wide delegation.",
      });
    }
    const list = body && typeof body === "object" ? (body as { domains?: unknown }).domains : null;
    const entries = Array.isArray(list) ? list : [];
    const verified = entries
      .filter((entry) => entry && typeof entry === "object" && (entry as { verified?: unknown }).verified === true)
      .map((entry) => (entry as { domainName?: unknown }).domainName)
      .filter((name): name is string => typeof name === "string" && name.length > 0)
      .map((name) => name.trim().toLowerCase());
    return { ok: true, verified: [...new Set(verified)].slice(0, MAX_DOMAINS), total: entries.length, admin: split.adminEmail };
  } catch {
    return networkFailure(LABEL);
  }
}

/** Prove the delegation works and report how much of the directory it can see. */
export async function verifyKey(raw: string, signal?: AbortSignal): Promise<WorkspaceResult<{ account: string; verified: number; total: number }>> {
  const result = await domains(raw, signal);
  if (!result.ok) return result;
  return { ok: true, account: `Impersonating ${result.admin}`, verified: result.verified.length, total: result.total };
}

/** Verified Workspace domains, used only to attribute hostnames OUTSIDE already found. */
export async function ownedDomains(raw: string, signal?: AbortSignal): Promise<WorkspaceResult<{ domains: string[] }>> {
  const result = await domains(raw, signal);
  return result.ok ? { ok: true, domains: result.verified } : result;
}
