import { NextRequest, NextResponse } from "next/server";
import { getSessionContext, hasOrgRole } from "@/lib/auth";
import { getGuardianStore } from "@/lib/guardian/store";
import { clientIdentity, rateLimit } from "@/lib/security/ratelimit";

export const runtime = "nodejs";

async function authorize(req: NextRequest): Promise<{ orgId: string } | NextResponse> {
  if (!(await rateLimit(`guardian:channel:${clientIdentity(req)}`, 30, 60_000)).ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const orgId = new URL(req.url).searchParams.get("orgId") ?? "";
  const membership = ctx.memberships.find((item) => item.org.id === orgId);
  if (!membership || membership.org.plan === "free" || !hasOrgRole(ctx, orgId, "admin")) return NextResponse.json({ error: "Paid organization administrator access required" }, { status: 403 });
  return { orgId };
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req);
  if (auth instanceof NextResponse) return auth;
  let body: { enabled?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  if (typeof body.enabled !== "boolean") return NextResponse.json({ error: "enabled must be boolean" }, { status: 422 });
  const updated = await (await getGuardianStore()).setChannelEnabled(auth.orgId, (await context.params).id, body.enabled);
  return updated ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Channel not found" }, { status: 404 });
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req);
  if (auth instanceof NextResponse) return auth;
  const deleted = await (await getGuardianStore()).deleteChannel(auth.orgId, (await context.params).id);
  return deleted ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Channel not found" }, { status: 404 });
}
