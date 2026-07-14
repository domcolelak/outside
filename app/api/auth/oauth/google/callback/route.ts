import { NextRequest, NextResponse } from "next/server";
import { getAuthStore } from "@/lib/auth";
import { hashPassword } from "@/lib/auth/password";
import { SESSION_MAX_AGE, sessionCookie, signSession } from "@/lib/auth/session";
import { exchangeGoogleCode, googleConfigured, OAUTH_STATE_COOKIE, verifyState } from "@/lib/auth/oauth";
import { randomBytes } from "node:crypto";
import { APP_URL } from "@/lib/config/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Google OAuth callback: verify state, exchange code, find-or-create the user. */
export async function GET(req: NextRequest) {
  if (!googleConfigured()) return NextResponse.redirect(new URL("/login?error=oauth_unconfigured", APP_URL));

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = req.cookies.get(OAUTH_STATE_COOKIE)?.value;

  if (!code || !verifyState(cookieState, state)) {
    return NextResponse.redirect(new URL("/login?error=oauth_failed", APP_URL));
  }

  const profile = await exchangeGoogleCode(code);
  if (!profile) return NextResponse.redirect(new URL("/login?error=oauth_failed", APP_URL));

  const store = await getAuthStore();
  let user = await store.findUserByEmail(profile.email);
  if (!user) {
    // OAuth accounts get an unusable random password hash (they sign in via Google).
    const passwordHash = await hashPassword(randomBytes(24).toString("base64url"));
    const created = await store.createUserWithOrg({
      email: profile.email,
      name: profile.name,
      passwordHash,
      orgName: `${profile.name.split(" ")[0]} workspace`,
      emailVerified: true,
    });
    user = created.user;
  }

  const res = NextResponse.redirect(new URL("/account", APP_URL));
  res.headers.append("Set-Cookie", sessionCookie(signSession(user.id, SESSION_MAX_AGE, user.sessionVersion)));
  // Clear the state cookie.
  res.headers.append("Set-Cookie", `${OAUTH_STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  return res;
}
