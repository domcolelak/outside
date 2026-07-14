import { NextRequest, NextResponse } from "next/server";
import { getSessionContext, hasOrgRole } from "@/lib/auth";
import { getMonitorStore, PLAN_MONITOR_LIMIT, type Frequency } from "@/lib/monitoring";
import { InvalidTargetError, normalizeDomain } from "@/lib/security/target";
import { getStore } from "@/lib/persistence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const orgId = new URL(req.url).searchParams.get("orgId") ?? "";
  if (!hasOrgRole(ctx, orgId, "viewer")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const store = await getMonitorStore();
  return NextResponse.json({ monitors: await store.list(orgId) });
}

export async function POST(req: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { orgId?: string; domain?: string; frequency?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const orgId = String(body.orgId ?? "");
  const membership = ctx.memberships.find((m) => m.org.id === orgId);
  // Creating a monitor requires at least analyst.
  if (!membership || !hasOrgRole(ctx, orgId, "analyst")) {
    return NextResponse.json({ error: "You need analyst access to add monitors." }, { status: 403 });
  }

  let domain: string;
  try {
    domain = normalizeDomain(body.domain ?? "");
  } catch (e) {
    return NextResponse.json({ error: e instanceof InvalidTargetError ? e.message : "Invalid domain" }, { status: 422 });
  }
  const frequency: Frequency = body.frequency === "weekly" ? "weekly" : "daily";

  const verification = await (await getStore()).getVerification(domain);
  if (verification?.status !== "verified" || verification.orgId !== orgId) {
    return NextResponse.json({ error: "Verify ownership of this domain for the organization before monitoring it." }, { status: 403 });
  }

  const store = await getMonitorStore();
  const existing = await store.list(orgId);
  if (existing.some((m) => m.domain === domain)) {
    return NextResponse.json({ error: "That domain is already monitored." }, { status: 409 });
  }
  const limit = PLAN_MONITOR_LIMIT[membership.org.plan];
  if (existing.length >= limit) {
    return NextResponse.json({ error: `Your ${membership.org.plan} plan allows ${limit} monitored domain${limit === 1 ? "" : "s"}. Upgrade to add more.`, code: "plan_limit" }, { status: 402 });
  }

  const monitor = await store.create({ orgId, domain, frequency });
  return NextResponse.json({ monitor });
}
