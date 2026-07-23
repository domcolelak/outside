import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { currentKevIndex } from "@/lib/analysis/kev";
import { detectCoverageGaps, buildProposals } from "@/lib/evolution/evolution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Evolution control center: the coverage gaps and DRAFT proposals derived from
 * comparing the live CISA KEV catalogue against what OUTSIDE can correlate.
 * Read-only and authenticated. Nothing here is ever applied automatically —
 * every proposal awaits founder approval.
 */
export async function GET() {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const kev = currentKevIndex();
  const gaps = detectCoverageGaps(kev);
  const proposals = buildProposals(gaps);

  return NextResponse.json(
    { kevSyncedAt: kev.syncedAt, kevSize: kev.size, gapCount: gaps.length, proposals },
    { headers: { "cache-control": "private, no-store" } },
  );
}
