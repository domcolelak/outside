import { NextRequest, NextResponse } from "next/server";
import { getAuthStore, getSessionContext } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Accept a team invite. Requires an authenticated session. */
export async function POST(req: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated", needsAuth: true }, { status: 401 });
  if (!ctx.user.emailVerifiedAt) return NextResponse.json({ error: "Verify your email before accepting an invitation.", code: "email_unverified" }, { status: 403 });

  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const token = String(body.token ?? "");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 422 });

  const store = await getAuthStore();
  const invite = await store.getInviteByToken(token);
  if (!invite || invite.acceptedAt) return NextResponse.json({ error: "This invitation is invalid or already used." }, { status: 410 });

  if (invite.revokedAt || Date.parse(invite.expiresAt) <= Date.now()) {
    return NextResponse.json({ error: "This invitation has expired or was revoked." }, { status: 410 });
  }
  if (invite.email !== ctx.user.email.toLowerCase()) {
    return NextResponse.json({ error: "Sign in with the email address this invitation was sent to." }, { status: 403 });
  }

  const result = await store.acceptInvite(token, ctx.user.id, ctx.user.email);
  if (!result) return NextResponse.json({ error: "Could not accept invitation." }, { status: 409 });
  return NextResponse.json({ ok: true, orgId: result.orgId, role: result.role });
}
