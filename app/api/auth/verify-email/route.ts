import { NextRequest, NextResponse } from "next/server";
import { getAuthStore, getSessionContext } from "@/lib/auth";
import { issueEmailVerification, verifyEmailVerification } from "@/lib/auth/email-verification";
import { verifyEmail } from "@/lib/email/templates";
import { sendDurably } from "@/lib/email/outbox";
import { clientIdentity, requireBudgets } from "@/lib/security/ratelimit";
import { APP_URL } from "@/lib/config/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const claim = verifyEmailVerification(token);
  if (!claim || !(await (await getAuthStore()).markEmailVerified(claim.uid, claim.email))) {
    return NextResponse.redirect(new URL("/account?emailVerification=invalid", APP_URL));
  }
  return NextResponse.redirect(new URL("/account?emailVerification=complete", APP_URL));
}

export async function POST(req: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (ctx.user.emailVerifiedAt) return NextResponse.json({ ok: true });
  const limit = await requireBudgets([
    { key: `verify-email:client:${clientIdentity(req)}`, limit: 5, windowMs: 60 * 60_000 },
    { key: `verify-email:user:${ctx.user.id}`, limit: 3, windowMs: 60 * 60_000 },
  ]);
  if (!limit.ok) return NextResponse.json({ error: "Too many verification emails" }, { status: 429 });
  const token = issueEmailVerification(ctx.user.id, ctx.user.email);
  const hour = Math.floor(Date.now() / 3_600_000);
  await sendDurably(verifyEmail(ctx.user.email, `${APP_URL}/api/auth/verify-email?token=${encodeURIComponent(token)}`), `verify-email:${ctx.user.id}:${hour}`);
  return NextResponse.json({ ok: true });
}
