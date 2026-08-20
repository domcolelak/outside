import { NextRequest, NextResponse } from "next/server";
import { authorizeCronHeader } from "@/lib/security/cron-auth";
import { currentKevIndex, syncKev } from "@/lib/analysis/kev";
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

  // A release restarts the app and therefore clears the process-local KEV
  // cache. The scheduler starts its jobs together, so Evolution must not race
  // the separate KEV job and persist an empty baseline. Refresh on demand and
  // fail without recording a run when the authoritative feed is unavailable.
  let kev = currentKevIndex();
  if (!kev.syncedAt || kev.size === 0) {
    try {
      await syncKev({ signal: AbortSignal.timeout(30_000) });
      kev = currentKevIndex();
    } catch (error) {
      operationalLog("error", "evolution.kev_unavailable", {}, error);
      return NextResponse.json({ error: "Evolution requires a current KEV catalogue." }, { status: 503 });
    }
  }
  const decisions = await listDecisions();
  const gaps = detectCoverageGaps(kev, new Date(), 25, {
    affinity: productAffinity(decisions),
    decided: decidedProposalIds(decisions),
  });
  const proposals = buildProposals(gaps);
  const run = await recordEvolutionRun(proposals);
  operationalLog("info", "evolution.scheduled_run", { total: run.total, new: run.new, firstRun: run.firstRun, kevSize: kev.size });
  return NextResponse.json({ ranAt: run.at, total: run.total, new: run.new, firstRun: run.firstRun, kevSize: kev.size });
}
