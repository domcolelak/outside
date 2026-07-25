import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getSessionContext } from "@/lib/auth";
import { authorizedTargetOrg } from "@/lib/auth/target-access";
import { normalizeDomain, InvalidTargetError } from "@/lib/security/target";
import { runPassiveScan } from "@/lib/discovery/engine";
import { assess, ASSESS_CHECKS, ASSESS_CATALOGUE_VERSION } from "@/lib/assess/checks";
import { recordRun, listRuns, getRun, previousRun, diffRuns } from "@/lib/assess/store";
import { readLimitedJson, RequestBodyError } from "@/lib/http/body";
import { clientIdentity, rateLimit } from "@/lib/security/ratelimit";
import { operationalLog } from "@/lib/observability/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Assessment status for a target: verified ownership + run history + latest results. */
export async function GET(req: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const raw = new URL(req.url).searchParams.get("target") ?? "";
  const catalogue = { version: ASSESS_CATALOGUE_VERSION, checks: ASSESS_CHECKS };
  if (!raw) return NextResponse.json({ catalogue, target: null });

  let target: string;
  try {
    target = normalizeDomain(raw);
  } catch (error) {
    return NextResponse.json({ error: error instanceof InvalidTargetError ? error.message : "Invalid domain." }, { status: 400 });
  }

  const orgId = await authorizedTargetOrg(ctx, target, "viewer");
  if (!orgId) {
    return NextResponse.json({ catalogue, target, verified: false });
  }

  const runs = await listRuns(orgId, target);
  const latest = runs[0] ? await getRun(orgId, runs[0].id) : null;
  const baseline = latest ? await previousRun(orgId, target, latest.createdAt) : null;
  const diff = latest && baseline ? diffRuns(baseline, latest) : null;

  return NextResponse.json({ catalogue, target, verified: true, runs, latest, diff }, { headers: { "cache-control": "private, no-store" } });
}

/** Run a safe assessment against a verified target. */
export async function POST(req: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!ctx.user.emailVerifiedAt) return NextResponse.json({ error: "Verify your email first." }, { status: 403 });

  // An assessment runs a real (bounded, non-destructive) scan, so it is rate
  // limited like a scan and must not be usable as an unlimited probe.
  if (!(await rateLimit(`assess:run:${clientIdentity(req)}`, 6, 60_000)).ok) {
    return NextResponse.json({ error: "Too many assessments. Try again shortly." }, { status: 429 });
  }

  let body: { target?: string };
  try {
    body = (await readLimitedJson(req, 2_000)) as typeof body;
  } catch (error) {
    return NextResponse.json({ error: error instanceof RequestBodyError ? error.message : "Invalid request." }, { status: 400 });
  }

  let target: string;
  try {
    target = normalizeDomain(String(body.target ?? ""));
  } catch (error) {
    return NextResponse.json({ error: error instanceof InvalidTargetError ? error.message : "Invalid domain." }, { status: 400 });
  }

  // Assess only runs on a target the organization has proven it owns.
  const orgId = await authorizedTargetOrg(ctx, target, "admin");
  if (!orgId) {
    return NextResponse.json({ error: "Assessment requires a verified target and organization admin access. Verify ownership of this domain first." }, { status: 403 });
  }

  let findings;
  try {
    const result = await runPassiveScan(target, `assess_${randomUUID()}`, () => {}, {
      activeObservation: true,
      signal: AbortSignal.timeout(55_000),
    });
    findings = result.findings;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.name === "TimeoutError" ? "The assessment timed out. Try again." : "The assessment could not complete — the target may be unreachable." }, { status: 502 });
  }

  const assessment = assess(findings);
  const run = await recordRun({ orgId, target, createdBy: ctx.user.id, result: assessment });
  const full = await getRun(orgId, run.id);
  const baseline = await previousRun(orgId, target, run.createdAt);
  const diff = baseline && full ? diffRuns(baseline, full) : null;

  operationalLog("info", "assess.run", { orgId, target, passed: assessment.summary.passed, failed: assessment.summary.failed });
  return NextResponse.json({ run: full, diff });
}
