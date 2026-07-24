import { NextRequest, NextResponse } from "next/server";
import { getSessionContext, hasOrgRole } from "@/lib/auth";
import { verifyToken, listZones } from "@/lib/integrations/cloudflare";
import { saveConnection, getConnectionSummary, deleteConnection } from "@/lib/integrations/connections";
import { clientIdentity, rateLimit } from "@/lib/security/ratelimit";
import { readLimitedJson, RequestBodyError } from "@/lib/http/body";
import { operationalLog } from "@/lib/observability/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROVIDER = "cloudflare" as const;

/**
 * Connecting a provider is an administrative action on the organization: it
 * stores a credential that can later change live DNS. Owner/admin only, and the
 * token is verified against Cloudflare before anything is persisted. The token
 * itself is never echoed back — callers only ever see a hint and the zones.
 */
async function authorize(req: NextRequest, orgId: string) {
  const ctx = await getSessionContext();
  if (!ctx) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  if (!ctx.user.emailVerifiedAt) return { error: NextResponse.json({ error: "Verify your email first." }, { status: 403 }) };
  if (!orgId || !hasOrgRole(ctx, orgId, "admin")) {
    return { error: NextResponse.json({ error: "Organization admin access is required." }, { status: 403 }) };
  }
  return { ctx };
}

export async function GET(req: NextRequest) {
  const orgId = new URL(req.url).searchParams.get("orgId") ?? "";
  const auth = await authorize(req, orgId);
  if (auth.error) return auth.error;

  const connection = await getConnectionSummary(orgId, PROVIDER);
  return NextResponse.json({ connected: !!connection, connection }, { headers: { "cache-control": "private, no-store" } });
}

export async function POST(req: NextRequest) {
  // Bounded: a connect attempt calls out to Cloudflare, so it must not be usable
  // as an unlimited token-probing oracle.
  if (!(await rateLimit(`integrations:connect:${clientIdentity(req)}`, 10, 60_000)).ok) {
    return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  }

  let body: { orgId?: string; token?: string };
  try {
    body = (await readLimitedJson(req, 8_000)) as typeof body;
  } catch (error) {
    return NextResponse.json({ error: error instanceof RequestBodyError ? error.message : "Invalid request." }, { status: 400 });
  }

  const orgId = String(body.orgId ?? "");
  const auth = await authorize(req, orgId);
  if (auth.error) return auth.error;

  const token = String(body.token ?? "").trim();
  if (token.length < 20 || token.length > 200) {
    return NextResponse.json({ error: "That does not look like a Cloudflare API token." }, { status: 400 });
  }

  // Prove the token works before storing it, and scope what it can reach.
  let zones;
  try {
    const identity = await verifyToken(token);
    if (!identity.valid) {
      return NextResponse.json({ error: "Cloudflare reports this token is not active." }, { status: 400 });
    }
    zones = await listZones(token);
  } catch (error) {
    // Never include the token or raw provider payload in the response.
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not reach Cloudflare." }, { status: 400 });
  }

  if (zones.length === 0) {
    return NextResponse.json({ error: "This token has no zones. Give it Zone:Read and DNS:Edit on the zones you want OUTSIDE to manage." }, { status: 400 });
  }

  const connection = await saveConnection({ orgId, provider: PROVIDER, token, zones, createdBy: auth.ctx!.user.id });
  operationalLog("info", "integrations.connected", { provider: PROVIDER, orgId, zones: zones.length });
  return NextResponse.json({ connected: true, connection });
}

export async function DELETE(req: NextRequest) {
  const orgId = new URL(req.url).searchParams.get("orgId") ?? "";
  const auth = await authorize(req, orgId);
  if (auth.error) return auth.error;

  await deleteConnection(orgId, PROVIDER);
  operationalLog("info", "integrations.disconnected", { provider: PROVIDER, orgId });
  return NextResponse.json({ connected: false });
}
