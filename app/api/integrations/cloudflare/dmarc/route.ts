import { NextRequest, NextResponse } from "next/server";
import { getSessionContext, hasOrgRole } from "@/lib/auth";
import { authorizedTargetOrg } from "@/lib/auth/target-access";
import { getConnectionSummary, getConnectionToken } from "@/lib/integrations/connections";
import { previewDmarcRemediation, applyDmarcRemediation, rollbackRemediation } from "@/lib/integrations/remediate";
import { recordApplied, activeRemediation, markRolledBack } from "@/lib/integrations/applied";
import { readLimitedJson, RequestBodyError } from "@/lib/http/body";
import { clientIdentity, rateLimit } from "@/lib/security/ratelimit";
import { operationalLog } from "@/lib/observability/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROVIDER = "cloudflare" as const;
const ACTION = "add_dmarc_monitoring";

/**
 * Applying a remediation writes to the customer's live DNS, so it is gated four
 * ways: an owner/admin session, a verified email, the domain proven to belong to
 * that organization, and a zone the connected token actually manages (checked
 * again inside the remediation itself). Every apply is reversible and recorded.
 */
async function gate(orgId: string, target?: string) {
  const ctx = await getSessionContext();
  if (!ctx) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  if (!ctx.user.emailVerifiedAt) return { error: NextResponse.json({ error: "Verify your email first." }, { status: 403 }) };
  if (!orgId || !hasOrgRole(ctx, orgId, "admin")) {
    return { error: NextResponse.json({ error: "Organization admin access is required." }, { status: 403 }) };
  }
  if (target) {
    const owner = await authorizedTargetOrg(ctx, target, "admin");
    if (owner !== orgId) {
      return { error: NextResponse.json({ error: "This domain is not a verified target of your organization." }, { status: 403 }) };
    }
  }
  return { ctx };
}

/** Which connected zones can be remediated, and what state each is in. */
export async function GET(req: NextRequest) {
  const orgId = new URL(req.url).searchParams.get("orgId") ?? "";
  const auth = await gate(orgId);
  if (auth.error) return auth.error;

  const connection = await getConnectionSummary(orgId, PROVIDER);
  if (!connection) return NextResponse.json({ connected: false, zones: [] });

  const zones = await Promise.all(
    connection.zones.map(async (zone) => {
      const owner = await authorizedTargetOrg(auth.ctx!, zone.name, "admin");
      const applied = owner === orgId ? await activeRemediation(orgId, PROVIDER, zone.name, ACTION) : null;
      return {
        name: zone.name,
        verified: owner === orgId,
        applied: applied ? { id: applied.id, appliedAt: applied.appliedAt } : null,
        preview: previewDmarcRemediation(zone.name),
      };
    }),
  );

  return NextResponse.json({ connected: true, zones }, { headers: { "cache-control": "private, no-store" } });
}

/** Apply the DMARC monitoring record. Additive and reversible (p=none). */
export async function POST(req: NextRequest) {
  if (!(await rateLimit(`integrations:apply:${clientIdentity(req)}`, 10, 60_000)).ok) {
    return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  }

  let body: { orgId?: string; target?: string };
  try {
    body = (await readLimitedJson(req, 4_000)) as typeof body;
  } catch (error) {
    return NextResponse.json({ error: error instanceof RequestBodyError ? error.message : "Invalid request." }, { status: 400 });
  }

  const orgId = String(body.orgId ?? "");
  const target = String(body.target ?? "").trim().toLowerCase();
  const auth = await gate(orgId, target);
  if (auth.error) return auth.error;

  if (await activeRemediation(orgId, PROVIDER, target, ACTION)) {
    return NextResponse.json({ error: "A DMARC record applied by OUTSIDE is already in place for this domain." }, { status: 409 });
  }

  const token = await getConnectionToken(orgId, PROVIDER);
  if (!token) return NextResponse.json({ error: "Connect your Cloudflare account first." }, { status: 400 });

  let result;
  try {
    result = await applyDmarcRemediation(target, { token, actorId: auth.ctx!.user.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Cloudflare rejected the change." }, { status: 400 });
  }
  if (!result.applied || !result.handle) {
    return NextResponse.json({ error: result.summary }, { status: 400 });
  }

  const record = await recordApplied({ orgId, provider: PROVIDER, target, action: ACTION, handle: result.handle, appliedBy: auth.ctx!.user.id });
  operationalLog("info", "integrations.remediation_applied_by_customer", { provider: PROVIDER, orgId, target, action: ACTION });
  return NextResponse.json({ applied: true, summary: result.summary, remediation: { id: record.id, appliedAt: record.appliedAt } });
}

/** Roll the record back — removes exactly what OUTSIDE created. */
export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const orgId = url.searchParams.get("orgId") ?? "";
  const target = (url.searchParams.get("target") ?? "").trim().toLowerCase();
  const auth = await gate(orgId, target);
  if (auth.error) return auth.error;

  const active = await activeRemediation(orgId, PROVIDER, target, ACTION);
  if (!active) return NextResponse.json({ error: "Nothing to roll back for this domain." }, { status: 404 });

  const token = await getConnectionToken(orgId, PROVIDER);
  if (!token) return NextResponse.json({ error: "Connect your Cloudflare account first." }, { status: 400 });

  try {
    await rollbackRemediation(active.handle, { token, actorId: auth.ctx!.user.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Cloudflare rejected the rollback." }, { status: 400 });
  }

  await markRolledBack(active.id);
  operationalLog("info", "integrations.remediation_rolled_back_by_customer", { provider: PROVIDER, orgId, target });
  return NextResponse.json({ rolledBack: true });
}
