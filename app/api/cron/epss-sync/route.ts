import { NextRequest, NextResponse } from "next/server";
import { authorizeCronHeader } from "@/lib/security/cron-auth";
import { currentEpssIndex, syncEpss } from "@/lib/analysis/epss";
import { operationalLog } from "@/lib/observability/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Refresh EPSS exploitation-probability scores for the correlated CVE set.
 * Scheduled daily; safe to call more often. */
export async function GET(req: NextRequest) {
  const authorization = authorizeCronHeader(req.headers.get("authorization"));
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  try {
    const result = await syncEpss({ signal: AbortSignal.timeout(20_000) });
    operationalLog("info", "epss.sync_succeeded", { count: result.count });
    return NextResponse.json({ ranAt: result.syncedAt, ...result });
  } catch (error) {
    operationalLog("error", "epss.sync_failed", {}, error);
    const index = currentEpssIndex();
    return NextResponse.json({ error: "EPSS sync failed", cachedCount: index.size, cachedSyncedAt: index.syncedAt }, { status: 502 });
  }
}
