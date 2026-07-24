import { NextRequest, NextResponse } from "next/server";
import { getAuthStore } from "@/lib/auth";
import { verifyPassword } from "@/lib/auth/password";
import { SESSION_MAX_AGE, sessionCookie, signSession } from "@/lib/auth/session";
import { clientIdentity, rateLimit } from "@/lib/security/ratelimit";
import { enterpriseSsoRequirement } from "@/lib/enterprise/login-policy";
import { readLimitedJson, RequestBodyError } from "@/lib/http/body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A real scrypt hash used only to equalize the nonexistent-user path. It does
// not correspond to any accepted credential and avoids per-request salt work.
const DUMMY_PASSWORD_HASH = "scrypt$b3V0c2lkZS1sb2dpbi1kdW1teS12MQ$gwldnd9qAHo2xk4jPYmyiZ0MHnyPVUH5xtd5JS-sAFKx49iVu3deKdx4MTQXheRkDf_4y5v8Jz-au5Nz_2QV9A";

export async function POST(req: NextRequest) {
  const client = clientIdentity(req);
  // Tighter limit on login to blunt credential guessing.
  if (!(await rateLimit(`login:${client}`, 8, 60_000)).ok) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });

  let body: { email?: string; password?: string };
  try {
    body = await readLimitedJson(req, 16_000) as typeof body;
  } catch (error) {
    return NextResponse.json({ error: error instanceof RequestBodyError ? error.message : "Invalid request." }, { status: error instanceof RequestBodyError ? error.status : 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  const store = await getAuthStore();
  const user = await store.findUserByEmail(email);
  // Same generic message + password check either way to avoid user enumeration.
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user || !ok) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  const sso = await enterpriseSsoRequirement(user, { authStore: store });
  if (sso) return NextResponse.json({ error: "Enterprise SSO is required for this account.", code: "sso_required", ssoUrl: sso.ssoUrl }, { status: 403 });

  const res = NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } });
  res.headers.append("Set-Cookie", sessionCookie(signSession(user.id, SESSION_MAX_AGE, user.sessionVersion)));
  return res;
}
