/**
 * Google OAuth (OpenID Connect). Env-gated: only active when GOOGLE_CLIENT_ID
 * and GOOGLE_CLIENT_SECRET are set. A signed, short-lived state cookie protects
 * the callback against CSRF. This is a standard authorization-code flow.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { authSecret, authVerificationSecrets } from "@/lib/config/secrets";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
export const OAUTH_STATE_COOKIE = "outside_oauth_state";

export function googleConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function redirectUri(): string {
  return `${APP_URL}/api/auth/oauth/google/callback`;
}

/** Create a signed state token to store in a cookie and echo via the OAuth flow. */
export function makeState(): string {
  const nonce = randomBytes(16).toString("base64url");
  const sig = createHmac("sha256", authSecret()).update(nonce).digest("base64url");
  return `${nonce}.${sig}`;
}

export function verifyState(cookieState: string | undefined, queryState: string | null): boolean {
  if (!cookieState || !queryState || cookieState !== queryState) return false;
  const [nonce, sig] = cookieState.split(".");
  if (!nonce || !sig) return false;
  const a = Buffer.from(sig);
  return authVerificationSecrets().some((secret) => {
    const expected = Buffer.from(createHmac("sha256", secret).update(nonce).digest("base64url"));
    return a.length === expected.length && timingSafeEqual(a, expected);
  });
}

export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

/** Exchange the authorization code for the user's verified email + name. */
export async function exchangeGoogleCode(code: string): Promise<{ email: string; name: string } | null> {
  const tokenRes = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return null;
  const token = (await tokenRes.json()) as { access_token?: string };
  if (!token.access_token) return null;

  const userRes = await fetch(USERINFO_ENDPOINT, {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  if (!userRes.ok) return null;
  const profile = (await userRes.json()) as { email?: string; email_verified?: boolean; name?: string };
  if (!profile.email || profile.email_verified === false) return null;
  return { email: profile.email.toLowerCase(), name: profile.name || profile.email.split("@")[0]! };
}
