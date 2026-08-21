import { NextRequest, NextResponse } from "next/server";
import { getSessionContext, hasOrgRole } from "@/lib/auth";
import { authorizedTargetOrg } from "@/lib/auth/target-access";
import { getConnectionSummary, getConnectionToken } from "@/lib/integrations/connections";
import { previewDmarcRemediation, applyDmarcRemediation, rollbackRemediation } from "@/lib/integrations/remediate";
import { recordApplied, activeRemediation, markRolledBack, recordVerification } from "@/lib/integrations/applied";
import { verifierFor, type RemediationCheck } from "@/lib/integrations/verification";
import { readLimitedJson, RequestBodyError } from "@/lib/http/body";
import { clientIdentity, rateLimit } from "@/lib/security/ratelimit";
import { operationalLog } from "@/lib/observability/log";
import { withConcurrency, CapacityError } from "@/lib/security/concurrency";
import { normalizeDomain, registrableDomain, InvalidTargetError } from "@/lib/security/target";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROVIDER = "cloudflare" as const;
const ACTION = "add_dmarc_monitoring";
/** The remediation capability this route implements, in the coverage registry. */
const CAPABILITY = "REM-CF-DMARC-MONITORING";

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

/**
 * Check the change the way the internet sees it, and store the answer.
 *
 * Cloudflare confirming its own write only proves the record was stored; it does
 * not prove the record is served. This is a separate, public observation — and it
 * can fail for reasons that have nothing to do with the change, so it never
 * fails the request: the DNS write already happened and stands on its own.
 */
async function postChangeCheck(recordId: string, target: string): Promise<RemediationCheck | null> {
  try {
    // Resolved through the capability rather than imported directly: a remediation
    // that declares it can be verified must have a verifier registered for it, and
    // one that does not simply cannot claim a verified result.
    const verify = verifierFor(CAPABILITY);
    if (!verify) return null;
    const expected = previewDmarcRemediation(target).record.content;
    const check = await verify(target, expected, AbortSignal.timeout(5_000));
    await recordVerification(recordId, check);
    return check;
  } catch (error) {
    operationalLog("warn", "integrations.remediation_post_check_unavailable", { provider: PROVIDER, target, action: ACTION }, error);
    return null;
  }
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
        applied: applied ? { id: applied.id, appliedAt: applied.appliedAt, verification: applied.verification } : null,
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
  let target: string;
  try {
    // The DMARC record is written at the zone apex (_dmarc.<registrable>), so the
    // zone root is the identity everything else must agree on: the ownership
    // gate, the duplicate check, the stored handle, and the zone-coverage guard
    // that keeps a rollback reachable. Recording a subdomain here would make the
    // stored target unmatchable against Cloudflare zone names.
    target = registrableDomain(normalizeDomain(String(body.target ?? "")));
  } catch (error) {
    return NextResponse.json({ error: error instanceof InvalidTargetError ? error.message : "Invalid domain." }, { status: 400 });
  }
  const auth = await gate(orgId, target);
  if (auth.error) return auth.error;

  try {
    return await withConcurrency(`remediation:cloudflare:${orgId}:${target}:${ACTION}`, 1, 120_000, async () => {
      if (await activeRemediation(orgId, PROVIDER, target, ACTION)) {
        return NextResponse.json({ error: "A DMARC record applied by OUTSIDE is already in place for this domain." }, { status: 409 });
      }

      const token = await getConnectionToken(orgId, PROVIDER);
      if (!token) return NextResponse.json({ error: "Connect your Cloudflare account first." }, { status: 400 });

      const result = await applyDmarcRemediation(target, { token, actorId: auth.ctx!.user.id });
      if (!result.applied || !result.handle) {
        return NextResponse.json({ error: result.summary }, { status: 409 });
      }

      try {
        const record = await recordApplied({ orgId, provider: PROVIDER, target, action: ACTION, handle: result.handle, appliedBy: auth.ctx!.user.id });
        operationalLog("info", "integrations.remediation_applied_by_customer", { provider: PROVIDER, orgId, target, action: ACTION });
        // Checked immediately, which usually reads as not-yet-observed: DNS
        // propagation takes minutes. That is the honest answer at this moment,
        // and PATCH lets the operator ask again once it has spread.
        const verification = await postChangeCheck(record.id, target);
        return NextResponse.json({ applied: true, summary: result.summary, remediation: { id: record.id, appliedAt: record.appliedAt, verification } });
      } catch (persistenceError) {
        try {
          await rollbackRemediation(result.handle, { token, actorId: auth.ctx!.user.id });
          operationalLog("error", "integrations.remediation_persistence_compensated", { provider: PROVIDER, orgId, target, action: ACTION }, persistenceError);
          return NextResponse.json({ error: "The change could not be recorded safely, so OUTSIDE rolled it back. Nothing remains applied." }, { status: 500 });
        } catch (rollbackError) {
          operationalLog("error", "integrations.remediation_compensation_failed", { provider: PROVIDER, orgId, target, action: ACTION, recordId: result.handle.recordId }, rollbackError);
          return NextResponse.json({ error: "Cloudflare accepted the change, but OUTSIDE could not store its rollback record or compensate automatically. Contact support immediately." }, { status: 500 });
        }
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof CapacityError ? "A change for this domain is already in progress." : error instanceof Error ? error.message : "Cloudflare rejected the change." },
      { status: error instanceof CapacityError ? 409 : 400 },
    );
  }
}

/**
 * Re-run the post-change check on demand. Separate from POST because a change
 * is applied once but may need observing several times: public DNS does not
 * update the instant the provider accepts the write.
 */
export async function PATCH(req: NextRequest) {
  if (!(await rateLimit(`integrations:verify:${clientIdentity(req)}`, 20, 60_000)).ok) {
    return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  }

  let body: { orgId?: string; target?: string };
  try {
    body = (await readLimitedJson(req, 4_000)) as typeof body;
  } catch (error) {
    return NextResponse.json({ error: error instanceof RequestBodyError ? error.message : "Invalid request." }, { status: 400 });
  }

  const orgId = String(body.orgId ?? "");
  let target: string;
  try {
    target = registrableDomain(normalizeDomain(String(body.target ?? "")));
  } catch (error) {
    return NextResponse.json({ error: error instanceof InvalidTargetError ? error.message : "Invalid domain." }, { status: 400 });
  }
  const auth = await gate(orgId, target);
  if (auth.error) return auth.error;

  const active = await activeRemediation(orgId, PROVIDER, target, ACTION);
  if (!active) return NextResponse.json({ error: "Nothing has been applied for this domain." }, { status: 404 });

  const verification = await postChangeCheck(active.id, target);
  if (!verification) {
    return NextResponse.json({ error: "The check could not be completed right now. The applied change is unaffected." }, { status: 503 });
  }
  return NextResponse.json({ verification });
}

/** Roll the record back — removes exactly what OUTSIDE created. */
export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const orgId = url.searchParams.get("orgId") ?? "";
  let target: string;
  try {
    // Must resolve to the same zone root the record was applied and recorded under.
    target = registrableDomain(normalizeDomain(url.searchParams.get("target") ?? ""));
  } catch (error) {
    return NextResponse.json({ error: error instanceof InvalidTargetError ? error.message : "Invalid domain." }, { status: 400 });
  }
  const auth = await gate(orgId, target);
  if (auth.error) return auth.error;

  try {
    return await withConcurrency(`remediation:cloudflare:${orgId}:${target}:${ACTION}`, 1, 120_000, async () => {
      const active = await activeRemediation(orgId, PROVIDER, target, ACTION);
      if (!active) return NextResponse.json({ error: "Nothing to roll back for this domain." }, { status: 404 });

      const token = await getConnectionToken(orgId, PROVIDER);
      if (!token) return NextResponse.json({ error: "Connect your Cloudflare account first." }, { status: 400 });

      await rollbackRemediation(active.handle, { token, actorId: auth.ctx!.user.id });
      await markRolledBack(active.id);
      operationalLog("info", "integrations.remediation_rolled_back_by_customer", { provider: PROVIDER, orgId, target });
      return NextResponse.json({ rolledBack: true });
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof CapacityError ? "A change for this domain is already in progress." : error instanceof Error ? error.message : "Cloudflare rejected the rollback." },
      { status: error instanceof CapacityError ? 409 : 400 },
    );
  }
}
