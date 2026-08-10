import { NextRequest, NextResponse } from "next/server";
import { getAuthStore } from "@/lib/auth";
import { hashPassword, passwordRejection } from "@/lib/auth/password";
import { SESSION_MAX_AGE, sessionCookie, signSession } from "@/lib/auth/session";
import { clientIdentity, rateLimit } from "@/lib/security/ratelimit";
import { issueEmailVerification } from "@/lib/auth/email-verification";
import { sendDurably } from "@/lib/email/outbox";
import { welcomeEmail } from "@/lib/email/templates";
import { currentLocale } from "@/lib/i18n/server";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { APP_URL } from "@/lib/config/runtime";
import { isValidEmail } from "@/lib/auth/validation";
import { readLimitedJson, RequestBodyError } from "@/lib/http/body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const client = clientIdentity(req);
  // Stable `code` alongside the English `error`: the code is what the UI
  // translates, the string stays for API consumers.
  if (!(await rateLimit(`signup:${client}`, 6, 60_000)).ok) return NextResponse.json({ error: "Too many attempts. Try again shortly.", code: "rate_limited" }, { status: 429 });

  let body: { email?: string; name?: string; password?: string; orgName?: string };
  try {
    body = await readLimitedJson(req, 20_000) as typeof body;
  } catch (error) {
    return NextResponse.json({ error: error instanceof RequestBodyError ? error.message : "Invalid request.", code: "invalid_request" }, { status: error instanceof RequestBodyError ? error.status : 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const name = String(body.name ?? "").trim().slice(0, 80);
  const password = String(body.password ?? "");
  const orgName = String(body.orgName ?? "").trim().slice(0, 80) || `${name || "My"} workspace`;

  if (!isValidEmail(email)) return NextResponse.json({ error: "Enter a valid email address.", code: "invalid_email" }, { status: 422 });
  if (!name) return NextResponse.json({ error: "Enter your name.", code: "missing_name" }, { status: 422 });
  const pwProblem = passwordRejection(password);
  if (pwProblem) return NextResponse.json({ error: pwProblem.message, code: pwProblem.code }, { status: 422 });

  const store = await getAuthStore();
  if (await store.findUserByEmail(email)) {
    return NextResponse.json({ error: "An account with that email already exists.", code: "email_taken" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const { user, org } = await store.createUserWithOrg({ email, name, passwordHash, orgName });

  // Whatever language they signed up in becomes their preference and their new
  // organization's default. Making them choose again, in a settings screen they
  // have not seen yet, would be the wrong first impression.
  const { locale } = await currentLocale();
  if (locale !== DEFAULT_LOCALE) {
    await Promise.all([
      store.setPreferredLocale(user.id, locale).catch(() => {}),
      store.setOrganizationLocale(org.id, locale).catch(() => {}),
    ]);
  }

  // Fire-and-forget welcome email (no-op console transport unless configured).
  const verifyUrl = `${APP_URL}/api/auth/verify-email?token=${encodeURIComponent(issueEmailVerification(user.id, user.email))}`;
  await sendDurably(welcomeEmail(user.email, user.name, verifyUrl, locale), `welcome:${user.id}`);

  const res = NextResponse.json({ user: { id: user.id, email: user.email, name: user.name }, org: { id: org.id, name: org.name, plan: org.plan } });
  res.headers.append("Set-Cookie", sessionCookie(signSession(user.id, SESSION_MAX_AGE, user.sessionVersion)));
  return res;
}
