import { NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { authorizedTargetOrg } from "@/lib/auth/target-access";
import { getRecommendationStatuses, listAudit, setRecommendationStatus } from "@/lib/aegis/store";
import { clientIdentity, rateLimit } from "@/lib/security/ratelimit";
import { normalizeDomain } from "@/lib/security/target";
import type { RecommendationStatus } from "@/lib/aegis/types";
import { readLimitedJson, RequestBodyError } from "@/lib/http/body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID: RecommendationStatus[] = ["open", "acknowledged", "in_progress", "resolved", "dismissed"];

/** Current statuses + recent audit for a target's recommendations. */
export async function GET(req: NextRequest) {
  const raw = new URL(req.url).searchParams.get("target") ?? "";
  let target: string;
  try {
    target = normalizeDomain(raw);
  } catch {
    return NextResponse.json({ error: "Invalid target" }, { status: 422 });
  }
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const orgId = await authorizedTargetOrg(ctx, target, "viewer");
  if (!orgId) return NextResponse.json({ error: "Verified organization access required" }, { status: 403 });
  const statuses = Object.fromEntries(await getRecommendationStatuses(orgId, target));
  return NextResponse.json({ statuses, audit: await listAudit(orgId, target, 30) });
}

/** Update a recommendation's status (acknowledge / start / resolve / dismiss). */
export async function POST(req: NextRequest) {
  const client = clientIdentity(req);
  if (!(await rateLimit(`rec:${client}`, 40, 60_000)).ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  let body: { target?: string; recId?: string; status?: string };
  try {
    body = await readLimitedJson(req, 12_000) as typeof body;
  } catch (error) {
    return NextResponse.json({ error: error instanceof RequestBodyError ? error.message : "Invalid request" }, { status: error instanceof RequestBodyError ? error.status : 400 });
  }
  let target: string;
  try {
    target = normalizeDomain(body.target ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid target" }, { status: 422 });
  }
  const recId = String(body.recId ?? "");
  const status = body.status as RecommendationStatus;
  if (!target || !recId || !VALID.includes(status)) {
    return NextResponse.json({ error: "Invalid recommendation update" }, { status: 422 });
  }

  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const orgId = await authorizedTargetOrg(ctx, target, "analyst");
  if (!orgId) return NextResponse.json({ error: "Verified organization analyst access required" }, { status: 403 });
  await setRecommendationStatus(orgId, target, recId, status, ctx.user.email);
  return NextResponse.json({ ok: true, status });
}
