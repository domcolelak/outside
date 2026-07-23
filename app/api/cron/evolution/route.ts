import { NextRequest, NextResponse } from "next/server";
import { authorizeCronHeader } from "@/lib/security/cron-auth";
import { currentKevIndex } from "@/lib/analysis/kev";
import { detectCoverageGaps, buildProposals } from "@/lib/evolution/evolution";
import { recordEvolutionRun } from "@/lib/evolution/state";
import { listDecisions, decidedProposalIds, productAffinity } from "@/lib/evolution/decisions";
import { operationalLog } from "@/lib/observability/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Scheduled Evolution pass: re-run the coverage-gap analysis against the live
 * KEV catalogue and record which proposals are new. Observe-and-propose only —
 * it never applies, writes, or deploys anything. Scheduled monthly; safe more
 * often. Its output is drafts awaiting founder approval at /evolution.
 */
export async function GET(req: NextRequest) {
  const authorization = authorizeCronHeader(req.headers.get("authorization"));
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });

  const kev = currentKevIndex();
  const decisions = await listDecisions();
  const gaps = detectCoverageGaps(kev, new Date(), 25, {
    affinity: productAffinity(decisions),
    decided: decidedProposalIds(decisions),
  });
  const proposals = buildProposals(gaps);
  const run = recordEvolutionRun(proposals);
  operationalLog("info", "evolution.scheduled_run", { total: run.total, new: run.new, firstRun: run.firstRun, kevSize: kev.size });
  return NextResponse.json({ ranAt: run.at, total: run.total, new: run.new, firstRun: run.firstRun, kevSize: kev.size });
}
