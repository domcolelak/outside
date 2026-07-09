import { NextRequest, NextResponse } from "next/server";
import { getMonitorStore } from "@/lib/monitoring";
import { runPassiveScan } from "@/lib/discovery/engine";
import { getStore } from "@/lib/persistence";
import { recordScan } from "@/lib/persistence/record";
import { dispatchChangeAlert } from "@/lib/email/alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PER_RUN = 10;

/**
 * Scheduled scan runner. Trigger from Vercel Cron, GitHub Actions, or any timer:
 *   curl -H "authorization: Bearer $CRON_SECRET" https://…/api/cron/scan
 * Idempotent: each monitor's nextRunAt advances after it runs, so overlapping
 * triggers do not double-scan.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const provided = auth?.replace(/^Bearer\s+/i, "") ?? new URL(req.url).searchParams.get("secret") ?? "";

  if (secret) {
    if (provided !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } else if (process.env.NODE_ENV === "production") {
    // Refuse to run an unprotected scheduler in production.
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }

  const monitorStore = await getMonitorStore();
  const scanStore = await getStore();
  const due = await monitorStore.due(new Date(), MAX_PER_RUN);

  const ran: Array<{ domain: string; assets: number; score: number; changes: number; alerted: boolean }> = [];
  for (const monitor of due) {
    try {
      const scanId = `cron_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const result = await runPassiveScan(monitor.domain, scanId, () => {});
      await recordScan(scanStore, result);
      await monitorStore.markRan(monitor.id, new Date());

      const alerted = await dispatchChangeAlert(monitor, result);
      ran.push({ domain: monitor.domain, assets: result.stats.assets, score: result.score.value, changes: result.changeSummary?.events.length ?? 0, alerted });
    } catch (err) {
      console.error(`[cron] monitor ${monitor.id} (${monitor.domain}) failed:`, (err as Error).message);
    }
  }

  return NextResponse.json({ ranAt: new Date().toISOString(), processed: ran.length, results: ran });
}
