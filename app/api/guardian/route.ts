import { NextRequest, NextResponse } from "next/server";
import { getSessionContext, hasOrgRole } from "@/lib/auth";
import { getGuardianStore } from "@/lib/guardian/store";
import { clientIdentity, rateLimit } from "@/lib/security/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await rateLimit(`guardian:read:${clientIdentity(req)}`, 120, 60_000)).ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const orgId = new URL(req.url).searchParams.get("orgId") ?? "";
  const membership = ctx.memberships.find((item) => item.org.id === orgId);
  if (!membership || !hasOrgRole(ctx, orgId, "viewer")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (membership.org.plan === "free") return NextResponse.json({ error: "Guardian requires a Professional or Agency plan", code: "premium_required" }, { status: 402 });
  return NextResponse.json(await (await getGuardianStore()).overview(orgId));
}
