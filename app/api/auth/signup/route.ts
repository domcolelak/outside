import { NextRequest, NextResponse } from "next/server";
import { getAuthStore } from "@/lib/auth";
import { hashPassword, passwordProblem } from "@/lib/auth/password";
import { sessionCookie, signSession } from "@/lib/auth/session";
import { rateLimit } from "@/lib/security/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`signup:${ip}`, 6, 60_000).ok) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });

  let body: { email?: string; name?: string; password?: string; orgName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const name = String(body.name ?? "").trim().slice(0, 80);
  const password = String(body.password ?? "");
  const orgName = String(body.orgName ?? "").trim().slice(0, 80) || `${name || "My"} workspace`;

  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 422 });
  if (!name) return NextResponse.json({ error: "Enter your name." }, { status: 422 });
  const pwProblem = passwordProblem(password);
  if (pwProblem) return NextResponse.json({ error: pwProblem }, { status: 422 });

  const store = await getAuthStore();
  if (await store.findUserByEmail(email)) {
    return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const { user, org } = await store.createUserWithOrg({ email, name, passwordHash, orgName });

  // Fire-and-forget welcome email (no-op console transport unless configured).
  import("@/lib/email/provider")
    .then(({ getEmailProvider }) => import("@/lib/email/templates").then(({ welcomeEmail }) => getEmailProvider().send(welcomeEmail(user.email, user.name))))
    .catch(() => {});

  const res = NextResponse.json({ user: { id: user.id, email: user.email, name: user.name }, org: { id: org.id, name: org.name, plan: org.plan } });
  res.headers.append("Set-Cookie", sessionCookie(signSession(user.id)));
  return res;
}
