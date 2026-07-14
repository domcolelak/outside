import { NextResponse } from "next/server";
import { buildGoogleAuthUrl, googleConfigured, makeState, OAUTH_STATE_COOKIE } from "@/lib/auth/oauth";
import { APP_URL } from "@/lib/config/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Begin Google OAuth: set a state cookie and redirect to Google. */
export async function GET() {
  if (!googleConfigured()) {
    return NextResponse.redirect(new URL("/login?error=oauth_unconfigured", APP_URL));
  }
  const state = makeState();
  const res = NextResponse.redirect(buildGoogleAuthUrl(state));
  const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
  res.headers.append("Set-Cookie", `${OAUTH_STATE_COOKIE}=${state}; Path=/; HttpOnly; SameSite=Lax;${secure} Max-Age=600`);
  return res;
}
