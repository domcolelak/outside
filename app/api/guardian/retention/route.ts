import { NextRequest, NextResponse } from "next/server";
import { getSessionContext, hasOrgRole } from "@/lib/auth";
import { getRetentionPolicy, setRetentionPolicy, validateRetentionValues } from "@/lib/guardian/retention";
import { clientIdentity, rateLimit } from "@/lib/security/ratelimit";
import { readLimitedJson, RequestBodyError } from "@/lib/http/body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorize(req: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) return { response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const orgId = new URL(req.url).searchParams.get("orgId") ?? "";
  const membership = ctx.memberships.find((item) => item.org.id === orgId);
  if (!membership || membership.org.plan === "free" || !hasOrgRole(ctx, orgId, "admin")) return { response: NextResponse.json({ error: "Paid organization administrator access required" }, { status: 403 }) };
  return { orgId };
}

export async function GET(req: NextRequest) {
  const auth = await authorize(req);
  if (auth.response) return auth.response;
  return NextResponse.json({ policy: await getRetentionPolicy(auth.orgId!) });
}

export async function PATCH(req: NextRequest) {
  if (!(await rateLimit(`guardian:retention:${clientIdentity(req)}`, 20, 60_000)).ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  const auth = await authorize(req);
  if (auth.response) return auth.response;
  let values;
  try {
    values = validateRetentionValues(await readLimitedJson(req, 8_000));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: error instanceof RequestBodyError ? error.status : 422 });
  }
  try {
    return NextResponse.json({ policy: await setRetentionPolicy(auth.orgId!, values) });
  } catch (error) {
    console.error("[guardian-retention] policy update failed", error);
    return NextResponse.json({ error: "Unable to update Guardian retention policy" }, { status: 500 });
  }
}
