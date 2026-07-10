import { NextResponse } from "next/server";
import { buildGoogleAuthUrl, googleConfigured, makeState, OAUTH_STATE_COOKIE } from "@/lib/auth/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Begin Google OAuth: set a state cookie and redirect to Google. */
export async function GET() {
  if (!googleConfigured()) {
    return NextResponse.redirect(new URL("/login?error=oauth_unconfigured", process.env.APP_URL ?? "http://localhost:3000"));
  }
  const state = makeState();
  const res = NextResponse.redirect(buildGoogleAuthUrl(state));
  const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
  res.headers.append("Set-Cookie", `${OAUTH_STATE_COOKIE}=${state}; Path=/; HttpOnly; SameSite=Lax;${secure} Max-Age=600`);
  return res;
}
