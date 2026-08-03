import { NextRequest, NextResponse } from "next/server";
import { getSessionContext, hasOrgRole } from "@/lib/auth";
import { clientIdentity, rateLimit, requireBudgets } from "@/lib/security/ratelimit";
import { readLimitedJson, RequestBodyError } from "@/lib/http/body";
import { getProvider } from "@/lib/integrations/providers/registry";
import { providerStatus, connectProvider, disconnectProvider } from "@/lib/integrations/providers/service";
import type { ProviderDefinition } from "@/lib/integrations/providers/types";
import { operationalLog } from "@/lib/observability/log";

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
  const search = new URL(req.url).searchParams;
  const orgId = search.get("orgId") ?? "";
  const r = await resolve(ctx, orgId);
  if ("error" in r) return r.error;
  const refresh = search.get("refresh") === "1";
  if (refresh && !(await requireBudgets([
    { key: "provider:test:global", limit: 100, windowMs: 60_000 },
    { key: `provider:test:org:${orgId}`, limit: 10, windowMs: 60_000 },
    { key: `provider:test:client:${clientIdentity(req)}`, limit: 10, windowMs: 60_000 },
  ])).ok) {
    return NextResponse.json({ error: "Too many connection tests. Try again shortly." }, { status: 429 });
  }
  return NextResponse.json(await providerStatus(r.def, orgId, { refresh }), { headers: { "cache-control": "private, no-store" } });
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
  if (!(await requireBudgets([
    { key: "provider:connect:global", limit: 100, windowMs: 60_000 },
    { key: `provider:connect:org:${orgId}`, limit: 8, windowMs: 60_000 },
  ])).ok) {
    return NextResponse.json({ error: "Too many connection attempts for this organization. Try again shortly." }, { status: 429 });
  }

  let result;
  try {
    result = await connectProvider(r.def, orgId, String(body.key ?? "").trim(), r.actorId);
  } catch (error) {
    operationalLog("error", "integrations.provider_connect_failed", { provider: r.def.id, orgId, actorId: r.actorId }, error);
    return NextResponse.json({ error: "The connection could not be saved safely. Nothing was changed." }, { status: 500 });
  }
  if (!result.ok) return NextResponse.json({ error: result.error, code: result.code }, { status: result.httpStatus });
  return NextResponse.json(result.status);
}

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const orgId = new URL(req.url).searchParams.get("orgId") ?? "";
  const r = await resolve(ctx, orgId);
  if ("error" in r) return r.error;
  try {
    return NextResponse.json(await disconnectProvider(r.def, orgId, r.actorId));
  } catch (error) {
    operationalLog("error", "integrations.provider_disconnect_failed", { provider: r.def.id, orgId, actorId: r.actorId }, error);
    return NextResponse.json({ error: "The connection could not be removed safely. Nothing was changed." }, { status: 500 });
  }
}
