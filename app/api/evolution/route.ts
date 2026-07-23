import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { currentKevIndex } from "@/lib/analysis/kev";
import { detectCoverageGaps, buildProposals } from "@/lib/evolution/evolution";
import { latestEvolutionRun } from "@/lib/evolution/state";
import { listDecisions, decidedProposalIds, productAffinity } from "@/lib/evolution/decisions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Evolution control center: the coverage gaps and DRAFT proposals derived from
 * comparing the live CISA KEV catalogue against what OUTSIDE can correlate,
 * reprioritised by what the founder has approved/rejected before. Read-only and
 * authenticated. Nothing here is ever applied automatically — every proposal
 * awaits founder approval.
 */
export async function GET() {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const kev = currentKevIndex();
  const decisions = await listDecisions();
  const gaps = detectCoverageGaps(kev, new Date(), 25, {
    affinity: productAffinity(decisions),
    decided: decidedProposalIds(decisions),
  });
  const proposals = buildProposals(gaps);

  return NextResponse.json(
    { kevSyncedAt: kev.syncedAt, kevSize: kev.size, gapCount: gaps.length, decisionsCount: decisions.length, lastScheduledRun: latestEvolutionRun(), proposals },
    { headers: { "cache-control": "private, no-store" } },
  );
}
