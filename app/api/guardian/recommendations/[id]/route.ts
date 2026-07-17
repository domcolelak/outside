import { NextRequest, NextResponse } from "next/server";
import { getSessionContext, hasOrgRole } from "@/lib/auth";
import { getGuardianStore } from "@/lib/guardian/store";
import type { GuardianRecommendationStatus } from "@/lib/guardian/types";
import { clientIdentity, rateLimit } from "@/lib/security/ratelimit";
import { readLimitedJson, RequestBodyError } from "@/lib/http/body";

export const runtime = "nodejs";
const VALID: GuardianRecommendationStatus[] = ["open", "acknowledged", "in_progress", "resolved", "dismissed"];

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await rateLimit(`guardian:update:${clientIdentity(req)}`, 40, 60_000)).ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  let body: { orgId?: unknown; status?: unknown };
  try { body = await readLimitedJson(req, 8_000) as typeof body; } catch (error) { return NextResponse.json({ error: error instanceof RequestBodyError ? error.message : "Invalid request" }, { status: error instanceof RequestBodyError ? error.status : 400 }); }
  const orgId = typeof body.orgId === "string" ? body.orgId : "";
  const status = body.status as GuardianRecommendationStatus;
  const membership = ctx.memberships.find((item) => item.org.id === orgId);
  if (!membership || membership.org.plan === "free" || !hasOrgRole(ctx, orgId, "analyst")) return NextResponse.json({ error: "Paid organization analyst access required" }, { status: 403 });
  if (!VALID.includes(status)) return NextResponse.json({ error: "Invalid recommendation status" }, { status: 422 });
  const updated = await (await getGuardianStore()).updateRecommendation(orgId, (await context.params).id, status, ctx.user.email);
  return updated ? NextResponse.json({ ok: true, status }) : NextResponse.json({ error: "Recommendation not found" }, { status: 404 });
}
