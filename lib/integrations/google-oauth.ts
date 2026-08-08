/**
 * Google service accounts — JWT-bearer token exchange.
 *
 * Google Cloud and Google Workspace are the same authentication story with a
 * different scope, so the exchange lives here once rather than being copied into
 * both adapters and drifting.
 *
 * Unlike every other provider, there is no secret to send: the service account
 * holds an RSA private key, and OUTSIDE proves possession by signing a
 * short-lived assertion with it. The key never leaves this process — only the
 * signature does.
 *
 * The credential is the service-account JSON exactly as Google issues it, so a
 * customer pastes the file without transcribing fields by hand.
 */

import { createSign } from "node:crypto";
import { mapProviderStatus, networkFailure, type ProviderFailure } from "@/lib/integrations/providers/http";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const TIMEOUT_MS = 12_000;
const MAX_BYTES = 200_000;
/** Google rejects assertions valid for more than an hour; a few minutes is plenty. */
const ASSERTION_LIFETIME_SECONDS = 300;

export interface GoogleServiceAccount {
  clientEmail: string;
  privateKey: string;
  projectId: string | null;
}

const base64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

/**
 * Parse the service-account JSON. Returns null for anything that is not a
 * service-account key, so a user-credentials file or a stray JSON blob is
 * refused before anything is signed.
 */
export function parseServiceAccount(raw: string): GoogleServiceAccount | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const json = parsed as Record<string, unknown>;
  if (json.type !== "service_account") return null;

  const clientEmail = typeof json.client_email === "string" ? json.client_email.trim() : "";
  // Pasted JSON often carries literal \n rather than real newlines.
  const privateKey = typeof json.private_key === "string" ? json.private_key.replace(/\\n/g, "\n") : "";
  if (!clientEmail || !privateKey.includes("BEGIN") || !privateKey.includes("PRIVATE KEY")) return null;

  return {
    clientEmail,
    privateKey,
    projectId: typeof json.project_id === "string" && json.project_id ? json.project_id : null,
  };
}

/** True when the value is a usable service-account key file. */
export function looksLikeServiceAccount(value: string): boolean {
  return parseServiceAccount(value) !== null;
}

/**
 * Exchange a signed assertion for an access token.
 *
 * `subject` impersonates a user, which Google Workspace requires: directory data
 * belongs to an admin, not to the service account itself. Google Cloud does not
 * use it.
 */
export async function accessToken(
  account: GoogleServiceAccount,
  scope: string,
  label: string,
  options: { subject?: string; signal?: AbortSignal } = {},
): Promise<{ ok: true; token: string } | ProviderFailure> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const claims: Record<string, unknown> = {
    iss: account.clientEmail,
    scope,
    aud: TOKEN_URL,
    iat: issuedAt,
    exp: issuedAt + ASSERTION_LIFETIME_SECONDS,
  };
  if (options.subject) claims.sub = options.subject;

  let assertion: string;
  try {
    const signingInput = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(JSON.stringify(claims))}`;
    const signature = createSign("RSA-SHA256").update(signingInput).sign(account.privateKey);
    assertion = `${signingInput}.${signature.toString("base64url")}`;
  } catch {
    // A malformed or unsupported key fails here, before anything is sent.
    return { ok: false, code: "bad_format", message: "The service-account private key could not be used to sign a request." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Google token request timed out.")), TIMEOUT_MS);
  const composed = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
      signal: composed,
    });

    if (!res.ok) {
      return mapProviderStatus(res.status, {
        label,
        retryAfter: res.headers.get("retry-after"),
        forbidden: options.subject
          ? `Rejected by ${label} — check that domain-wide delegation is granted for this client and scope, and that the impersonated admin exists.`
          : `Rejected by ${label} — check the service account is enabled and its key has not been revoked.`,
      });
    }

    const body = JSON.parse((await res.text()).slice(0, MAX_BYTES)) as { access_token?: unknown };
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
