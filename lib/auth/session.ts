/**
 * Stateless signed-cookie sessions. A compact HMAC-signed token (payload.sig)
 * avoids adding a JWT dependency while giving tamper-proof, expiring sessions.
 * The cookie is httpOnly + SameSite=Lax + Secure in production.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { authSecret, authVerificationSecrets } from "@/lib/config/secrets";

export const SESSION_COOKIE = "outside_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function b64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}
function unb64url(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}
function sign(payload: string, secret = authSecret()): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signSession(uid: string, maxAgeSeconds = SESSION_MAX_AGE, version = 0): string {
  const exp = Math.floor(Date.now() / 1000) + maxAgeSeconds;
  const payload = b64url(JSON.stringify({ uid, exp, ver: version }));
  return `${payload}.${sign(payload)}`;
}

export function verifySession(token: string | undefined): { uid: string; version: number } | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const sigBuf = Buffer.from(sig);
  const validSignature = authVerificationSecrets().some((secret) => {
    const expected = Buffer.from(sign(payload, secret));
    return sigBuf.length === expected.length && timingSafeEqual(sigBuf, expected);
  });
  if (!validSignature) return null;
  try {
    const { uid, exp, ver } = JSON.parse(unb64url(payload)) as { uid: string; exp: number; ver: number };
    if (!uid || typeof exp !== "number" || !Number.isSafeInteger(ver) || ver < 0 || exp < Math.floor(Date.now() / 1000)) return null;
    return { uid, version: ver };
  } catch {
    return null;
  }
}

export function sessionCookie(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax;${secure} Max-Age=${SESSION_MAX_AGE}`;
}

export function clearedSessionCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax;${secure} Max-Age=0`;
}
