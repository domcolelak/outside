import { NextResponse } from "next/server";
import { getAuthStore, getSessionContext } from "@/lib/auth";
import { clearedSessionCookie } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Revoke every session for the signed-in user, including this one. */
export async function POST() {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  await (await getAuthStore()).revokeSessions(ctx.user.id);
  const response = NextResponse.json({ ok: true });
  response.headers.append("Set-Cookie", clearedSessionCookie());
  return response;
}
