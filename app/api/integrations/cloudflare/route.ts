import { NextRequest, NextResponse } from "next/server";
import { getSessionContext, hasOrgRole } from "@/lib/auth";
import { verifyToken, listZones } from "@/lib/integrations/cloudflare";
import { saveConnection, getConnectionSummary, getConnectionToken, deleteConnection } from "@/lib/integrations/connections";
import { listActiveRemediations } from "@/lib/integrations/applied";
import { recordProviderAudit } from "@/lib/integrations/providers/audit";
import { clientIdentity, rateLimit, requireBudgets } from "@/lib/security/ratelimit";
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
  const search = new URL(req.url).searchParams;
  const orgId = search.get("orgId") ?? "";
  const auth = await authorize(req, orgId);
  if (auth.error) return auth.error;

  const connection = await getConnectionSummary(orgId, PROVIDER);
  if (connection && search.get("refresh") === "1") {
    if (!(await requireBudgets([
      { key: "cloudflare:test:global", limit: 100, windowMs: 60_000 },
      { key: `cloudflare:test:org:${orgId}`, limit: 10, windowMs: 60_000 },
      { key: `cloudflare:test:client:${clientIdentity(req)}`, limit: 10, windowMs: 60_000 },
    ])).ok) {
      return NextResponse.json({ error: "Too many Cloudflare connection tests. Try again shortly." }, { status: 429 });
    }
    const token = await getConnectionToken(orgId, PROVIDER);
    if (!token) return NextResponse.json({ error: "The saved Cloudflare credential is unavailable." }, { status: 500 });
    try {
      const identity = await verifyToken(token);
      if (!identity.valid) return NextResponse.json({ error: "Cloudflare reports this token is not active." }, { status: 409 });
      const zones = await listZones(token);

      // The same rollback-safety rule POST enforces. Without it, narrowing the
      // token's scope in the Cloudflare dashboard and pressing Refresh would
      // silently shrink the stored zones: the DMARC panel is rendered from them,
      // so a zone holding an applied remediation would lose its Roll back button
      // while DELETE kept refusing to disconnect until it was rolled back.
      const active = await listActiveRemediations(orgId, PROVIDER);
      const zoneNames = new Set(zones.map((zone) => zone.name));
      const unreachable = active.map((record) => record.target).filter((target) => !zoneNames.has(target));
      if (unreachable.length > 0) {
        return NextResponse.json({
          error: `This token can no longer access active remediation zone(s): ${unreachable.join(", ")}. The saved connection was kept so those changes stay reversible.`,
        }, { status: 409 });
      }

      const refreshed = await saveConnection({ orgId, provider: PROVIDER, token, zones, createdBy: auth.ctx!.user.id });
      await recordProviderAudit({
        orgId,
        provider: PROVIDER,
        action: "validated",
        actorId: auth.ctx!.user.id,
        detail: `${zones.length} accessible zone${zones.length === 1 ? "" : "s"}`,
      });
      return NextResponse.json({ connected: true, connection: refreshed }, { headers: { "cache-control": "private, no-store" } });
    } catch (error) {
      operationalLog("warn", "integrations.cloudflare_test_failed", { orgId, actorId: auth.ctx!.user.id }, error);
      return NextResponse.json({ error: "Cloudflare could not verify the saved token. The existing connection was kept." }, { status: 502 });
    }
  }
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

  const active = await listActiveRemediations(orgId, PROVIDER);
  const zoneNames = new Set(zones.map((zone) => zone.name));
  const missingRollbackZones = active.map((record) => record.target).filter((target) => !zoneNames.has(target));
  if (missingRollbackZones.length > 0) {
    return NextResponse.json({
      error: `The replacement token cannot access active remediation zone(s): ${missingRollbackZones.join(", ")}. Roll those changes back first or use a token that covers every listed zone.`,
    }, { status: 409 });
  }

  const previousSummary = await getConnectionSummary(orgId, PROVIDER);
  // Best-effort: used only to restore the previous token if the audit write
  // fails. An undecryptable credential (normal mid key-rotation) must never
  // block replacing or disconnecting it.
  const previousToken = previousSummary ? await getConnectionToken(orgId, PROVIDER).catch(() => null) : null;
  try {
    await recordProviderAudit({
      orgId,
      provider: PROVIDER,
      action: "validated",
      actorId: auth.ctx!.user.id,
      detail: `${zones.length} accessible zone${zones.length === 1 ? "" : "s"}`,
    });
  } catch {
    return NextResponse.json({ error: "The connection validation could not be audited safely. Nothing was changed." }, { status: 500 });
  }

  const connection = await saveConnection({ orgId, provider: PROVIDER, token, zones, createdBy: auth.ctx!.user.id });
  try {
    await recordProviderAudit({
      orgId,
      provider: PROVIDER,
      action: previousSummary ? "replaced" : "connected",
      actorId: auth.ctx!.user.id,
      detail: `${zones.length} accessible zone${zones.length === 1 ? "" : "s"}`,
    });
  } catch {
    if (previousSummary && previousToken) {
      await saveConnection({
        orgId,
        provider: PROVIDER,
        token: previousToken,
        zones: previousSummary.zones,
        createdBy: auth.ctx!.user.id,
      });
    } else {
      await deleteConnection(orgId, PROVIDER);
    }
    return NextResponse.json({ error: "The connection could not be recorded safely. Nothing was changed." }, { status: 500 });
  }
  operationalLog("info", "integrations.connected", { provider: PROVIDER, orgId, zones: zones.length });
  return NextResponse.json({ connected: true, connection });
}

export async function DELETE(req: NextRequest) {
  const orgId = new URL(req.url).searchParams.get("orgId") ?? "";
  const auth = await authorize(req, orgId);
  if (auth.error) return auth.error;

  const active = await listActiveRemediations(orgId, PROVIDER);
  if (active.length > 0) {
    return NextResponse.json({
      error: `Roll back ${active.length} active Cloudflare remediation${active.length === 1 ? "" : "s"} before disconnecting so the changes remain reversible.`,
    }, { status: 409 });
  }

  const previousSummary = await getConnectionSummary(orgId, PROVIDER);
  // Best-effort: used only to restore the previous token if the audit write
  // fails. An undecryptable credential (normal mid key-rotation) must never
  // block replacing or disconnecting it.
  const previousToken = previousSummary ? await getConnectionToken(orgId, PROVIDER).catch(() => null) : null;
  await deleteConnection(orgId, PROVIDER);
  try {
    await recordProviderAudit({ orgId, provider: PROVIDER, action: "disconnected", actorId: auth.ctx!.user.id });
  } catch {
    if (previousSummary && previousToken) {
      await saveConnection({
        orgId,
        provider: PROVIDER,
        token: previousToken,
        zones: previousSummary.zones,
        createdBy: auth.ctx!.user.id,
      });
    }
    return NextResponse.json({ error: "Cloudflare could not be disconnected safely. Nothing was changed." }, { status: 500 });
  }
  operationalLog("info", "integrations.disconnected", { provider: PROVIDER, orgId });
  return NextResponse.json({ connected: false });
}
