import { NextRequest, NextResponse } from "next/server";
import { getSessionContext, hasOrgRole } from "@/lib/auth";
import { getGuardianStore } from "@/lib/guardian/store";
import { clientIdentity, rateLimit } from "@/lib/security/ratelimit";
import { normalizeDomain } from "@/lib/security/target";
import { agencyAccess } from "@/lib/agency/access";
import { getAgencyStore } from "@/lib/agency/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await rateLimit(`guardian:evidence:${clientIdentity(req)}`, 90, 60_000)).ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const params = new URL(req.url).searchParams;
  let target: string;
  try { target = normalizeDomain(params.get("target") ?? ""); }
  catch { return NextResponse.json({ error: "A valid target is required" }, { status: 400 }); }
  const requestedOrgId = params.get("orgId") ?? "";
  const requestedAgencyId = params.get("agencyId") ?? "";
  const store = await getGuardianStore();
  let orgId = requestedOrgId;
  if (requestedOrgId) {
    const membership = ctx.memberships.find((item) => item.org.id === requestedOrgId);
    if (membership && hasOrgRole(ctx, requestedOrgId, "viewer")) {
      if (membership.org.plan === "free") return NextResponse.json({ error: "Evidence Intelligence requires a Professional or Agency plan", code: "premium_required" }, { status: 402 });
    } else {
      const access = requestedAgencyId ? await agencyAccess(req, "clients:read", requestedAgencyId) : null;
      const managed = access ? (await (await getAgencyStore()).clients(access.workspace.id)).some((client) => client.orgId === requestedOrgId) : false;
      if (!managed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else {
    const eligible = ctx.memberships.filter((item) => item.org.plan !== "free" && hasOrgRole(ctx, item.org.id, "viewer"));
    const candidates = (await Promise.all(eligible.map(async (item) => ({ orgId: item.org.id, exists: (await store.evidenceSnapshots(item.org.id, target, 1)).length > 0 })))).filter((item) => item.exists);
    if (candidates.length > 1) return NextResponse.json({ error: "The target exists in multiple workspaces; specify orgId" }, { status: 409 });
    orgId = candidates[0]?.orgId ?? "";
    if (!orgId) return NextResponse.json({ error: "Evidence snapshot or finding not found" }, { status: 404 });
  }
  const findingId = params.get("findingId")?.slice(0, 160);
  const intelligence = await store.evidenceIntelligence(orgId, target, findingId);
  if (!intelligence) return NextResponse.json({ error: "Evidence snapshot or finding not found" }, { status: 404 });
  return NextResponse.json(intelligence, { headers: { "Cache-Control": "private, no-store" } });
}
