import { NextRequest, NextResponse } from "next/server";
import { getAuthStore, getSessionContext } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Toggle the current user's change-alert preference for an org. */
export async function PATCH(req: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { orgId?: string; enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const orgId = String(body.orgId ?? "");
  if (!ctx.memberships.some((m) => m.org.id === orgId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const store = await getAuthStore();
  await store.setNotifyChanges(ctx.user.id, orgId, body.enabled !== false);
  return NextResponse.json({ ok: true, enabled: body.enabled !== false });
}
