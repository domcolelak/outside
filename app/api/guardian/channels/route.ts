import { NextRequest, NextResponse } from "next/server";
import { getSessionContext, hasOrgRole } from "@/lib/auth";
import { validateGuardianChannelConfig } from "@/lib/guardian/channel-config";
import { encryptGuardianConfig } from "@/lib/guardian/crypto";
import { getGuardianStore } from "@/lib/guardian/store";
import type { GuardianChannelType } from "@/lib/guardian/types";
import { clientIdentity, rateLimit } from "@/lib/security/ratelimit";
import { readLimitedJson, RequestBodyError } from "@/lib/http/body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const TYPES: GuardianChannelType[] = ["slack", "microsoft_teams", "discord", "webhook", "jira", "github_issues", "linear"];

export async function GET(req: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const orgId = new URL(req.url).searchParams.get("orgId") ?? "";
  const membership = ctx.memberships.find((item) => item.org.id === orgId);
  if (!membership || membership.org.plan === "free" || !hasOrgRole(ctx, orgId, "viewer")) return NextResponse.json({ error: "Paid organization access required" }, { status: 403 });
  return NextResponse.json({ channels: await (await getGuardianStore()).channels(orgId) });
}

export async function POST(req: NextRequest) {
  if (!(await rateLimit(`guardian:channel:${clientIdentity(req)}`, 20, 60_000)).ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  let body: { orgId?: unknown; type?: unknown; name?: unknown; config?: unknown };
  try { body = await readLimitedJson(req, 32_000) as typeof body; } catch (error) { return NextResponse.json({ error: error instanceof RequestBodyError ? error.message : "Invalid request" }, { status: error instanceof RequestBodyError ? error.status : 400 }); }
  const orgId = typeof body.orgId === "string" ? body.orgId : "";
  const type = body.type as GuardianChannelType;
  const membership = ctx.memberships.find((item) => item.org.id === orgId);
  if (!membership || membership.org.plan === "free" || !hasOrgRole(ctx, orgId, "admin")) return NextResponse.json({ error: "Paid organization administrator access required" }, { status: 403 });
  if (!TYPES.includes(type)) return NextResponse.json({ error: "Unsupported channel type" }, { status: 422 });
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 80) return NextResponse.json({ error: "Channel name must be between 1 and 80 characters" }, { status: 422 });
  try {
    const validated = validateGuardianChannelConfig(type, body.config);
    const channel = await (await getGuardianStore()).createChannel({ orgId, type, name, destinationHint: validated.destinationHint, encryptedConfig: encryptGuardianConfig(validated.config) });
    return NextResponse.json({ channel }, { status: 201 });
  } catch (error) {
    const status = /GUARDIAN_ENCRYPTION_KEY/.test((error as Error).message) ? 503 : 422;
    return NextResponse.json({ error: (error as Error).message }, { status });
  }
}
