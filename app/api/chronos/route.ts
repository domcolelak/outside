import { NextRequest, NextResponse } from "next/server";
import { getSessionContext, hasOrgRole } from "@/lib/auth";
import { getGuardianStore } from "@/lib/guardian/store";
import { clientIdentity, rateLimit } from "@/lib/security/ratelimit";
import { normalizeDomain } from "@/lib/security/target";
import { agencyAccess } from "@/lib/agency/access";
import { getAgencyStore } from "@/lib/agency/store";
import { reconstructAt, diffBetween, replay } from "@/lib/chronos/chronos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Chronos time-travel over a verified target's recorded Guardian history:
 *   ?at=<iso>              reconstruct the surface as it was at that instant
 *   ?from=<iso>&to=<iso>   diff the surface between two instants
 *   (default)              replay the whole history with per-step diffs
 * Premium (non-free plan), org-scoped, read-only.
 */
export async function GET(req: NextRequest) {
  if (!(await rateLimit(`chronos:${clientIdentity(req)}`, 90, 60_000)).ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const params = new URL(req.url).searchParams;
  let target: string;
  try { target = normalizeDomain(params.get("target") ?? ""); }
  catch { return NextResponse.json({ error: "A valid target is required" }, { status: 400 }); }

  const store = await getGuardianStore();
  const requestedOrgId = params.get("orgId") ?? "";
  const requestedAgencyId = params.get("agencyId") ?? "";
  let orgId = requestedOrgId;

  if (requestedOrgId) {
    const membership = ctx.memberships.find((item) => item.org.id === requestedOrgId);
    if (membership && hasOrgRole(ctx, requestedOrgId, "viewer")) {
      if (membership.org.plan === "free") return NextResponse.json({ error: "Chronos requires a Professional or Agency plan", code: "premium_required" }, { status: 402 });
    } else {
      const access = requestedAgencyId ? await agencyAccess(req, "clients:read", requestedAgencyId) : null;
      const managed = access ? (await (await getAgencyStore()).clients(access.workspace.id)).some((client) => client.orgId === requestedOrgId) : false;
      if (!managed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else {
    const eligible = ctx.memberships.filter((item) => item.org.plan !== "free" && hasOrgRole(ctx, item.org.id, "viewer"));
    const candidates = (await Promise.all(eligible.map(async (item) => ({ orgId: item.org.id, exists: (await store.history(item.org.id, target, 1)).length > 0 })))).filter((item) => item.exists);
    if (candidates.length > 1) return NextResponse.json({ error: "The target exists in multiple workspaces; specify orgId" }, { status: 409 });
    orgId = candidates[0]?.orgId ?? "";
    if (!orgId) return NextResponse.json({ error: "No recorded history for this target" }, { status: 404 });
  }

  const snapshots = await store.history(orgId, target, 64);
  if (!snapshots.length) return NextResponse.json({ error: "No recorded history for this target" }, { status: 404 });

  const at = params.get("at");
  const from = params.get("from");
  const to = params.get("to");
  const headers = { "Cache-Control": "private, no-store" } as const;

  if (at) {
    const state = reconstructAt(snapshots, at);
    return state ? NextResponse.json({ mode: "reconstruct", target, at, state }, { headers }) : NextResponse.json({ error: "No observation at or before that instant" }, { status: 404 });
  }
  if (from && to) {
    const diff = diffBetween(snapshots, from, to);
    return diff ? NextResponse.json({ mode: "diff", target, diff }, { headers }) : NextResponse.json({ error: "No observation in that range" }, { status: 404 });
  }
  return NextResponse.json({ mode: "replay", target, steps: replay(snapshots) }, { headers });
}
