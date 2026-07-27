import { NextRequest, NextResponse } from "next/server";
import { getSessionContext, hasOrgRole } from "@/lib/auth";
import { clientIdentity, rateLimit } from "@/lib/security/ratelimit";
import { readLimitedJson, RequestBodyError } from "@/lib/http/body";
import { getProvider } from "@/lib/integrations/providers/registry";
import { providerStatus, connectProvider, disconnectProvider } from "@/lib/integrations/providers/service";
import type { ProviderDefinition } from "@/lib/integrations/providers/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ provider: string }> };

/**
 * One route for every BYOK provider. Connecting a credential can drive live
 * calls billed to the customer, so it is an owner/admin action on a specific
 * organization with a verified email. All provider-specific behaviour lives in
 * the resolved ProviderDefinition.
 */
async function resolve(ctx: RouteCtx, orgId: string): Promise<{ def: ProviderDefinition; actorId: string } | { error: NextResponse }> {
  const session = await getSessionContext();
  if (!session) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  if (!session.user.emailVerifiedAt) return { error: NextResponse.json({ error: "Verify your email first." }, { status: 403 }) };

  const { provider } = await ctx.params;
  const def = getProvider(provider);
  if (!def) return { error: NextResponse.json({ error: "Unknown provider." }, { status: 404 }) };

  if (!orgId || !hasOrgRole(session, orgId, "admin")) {
    return { error: NextResponse.json({ error: "Organization admin access is required." }, { status: 403 }) };
  }
  return { def, actorId: session.user.id };
}

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const orgId = new URL(req.url).searchParams.get("orgId") ?? "";
  const r = await resolve(ctx, orgId);
  if ("error" in r) return r.error;
  return NextResponse.json(await providerStatus(r.def, orgId), { headers: { "cache-control": "private, no-store" } });
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  if (!(await rateLimit(`provider:connect:${clientIdentity(req)}`, 8, 60_000)).ok) {
    return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  }

  let body: { orgId?: string; key?: string };
  try {
    body = (await readLimitedJson(req, 4_000)) as typeof body;
  } catch (error) {
    return NextResponse.json({ error: error instanceof RequestBodyError ? error.message : "Invalid request." }, { status: 400 });
  }

  const orgId = String(body.orgId ?? "");
  const r = await resolve(ctx, orgId);
  if ("error" in r) return r.error;

  const result = await connectProvider(r.def, orgId, String(body.key ?? "").trim(), r.actorId);
  if (!result.ok) return NextResponse.json({ error: result.error, code: result.code }, { status: result.httpStatus });
  return NextResponse.json(result.status);
}

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const orgId = new URL(req.url).searchParams.get("orgId") ?? "";
  const r = await resolve(ctx, orgId);
  if ("error" in r) return r.error;
  return NextResponse.json(await disconnectProvider(r.def, orgId, r.actorId));
}
