/**
 * Stateless signed-cookie sessions. A compact HMAC-signed token (payload.sig)
 * avoids adding a JWT dependency while giving tamper-proof, expiring sessions.
 * The cookie is httpOnly + SameSite=Lax + Secure in production.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const SECRET = process.env.AUTH_SECRET ?? "outside-dev-auth-secret-change-me";
export const SESSION_COOKIE = "outside_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function b64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}
function unb64url(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}
function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("base64url");
}

export function signSession(uid: string, maxAgeSeconds = SESSION_MAX_AGE): string {
  const exp = Math.floor(Date.now() / 1000) + maxAgeSeconds;
  const payload = b64url(JSON.stringify({ uid, exp }));
  return `${payload}.${sign(payload)}`;
}

export function verifySession(token: string | undefined): { uid: string } | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payload);
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const { uid, exp } = JSON.parse(unb64url(payload)) as { uid: string; exp: number };
    if (!uid || typeof exp !== "number" || exp < Math.floor(Date.now() / 1000)) return null;
    return { uid };
  } catch {
    return null;
  }
}

export function sessionCookie(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax;${secure} Max-Age=${SESSION_MAX_AGE}`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
