import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getMonitorStore, type Monitor } from "@/lib/monitoring";
import { runPassiveScan } from "@/lib/discovery/engine";
import { getStore } from "@/lib/persistence";
import { recordScan } from "@/lib/persistence/record";
import { dispatchChangeAlert } from "@/lib/email/alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PER_RUN = 10;
const WORKERS = 2;
const LEASE_MS = 3 * 60_000;

function secretMatches(expected: string, provided: string): boolean {
  const a = Buffer.from(expected), b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim() ?? "";
  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || (process.env.NODE_ENV === "production" && Buffer.byteLength(secret) < 32)) {
    return NextResponse.json({ error: "A strong CRON_SECRET is not configured" }, { status: 503 });
  }
  if (!secretMatches(secret, provided)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const monitorStore = await getMonitorStore();
  const scanStore = await getStore();
  const claimed = await monitorStore.claimDue(new Date(), MAX_PER_RUN, LEASE_MS);
  const ran: Array<{ domain: string; assets: number; score: number; changes: number; alerted: boolean }> = [];
  const failed: Array<{ domain: string; error: string }> = [];
  let cursor = 0;

  const processMonitor = async (monitor: Monitor) => {
    const leaseId = monitor.leaseId!;
    try {
      const scanId = `cron_${monitor.id}_${new Date(monitor.nextRunAt).getTime()}`;
      const result = await runPassiveScan(monitor.domain, scanId, () => {}, { activeObservation: true, signal: AbortSignal.timeout(90_000) });
      let alreadyPersisted = false;
      try { await recordScan(scanStore, result); }
      catch (error) {
        if ((error as { code?: string }).code === "P2002" || /unique|duplicate/i.test((error as Error).message)) alreadyPersisted = true;
        else throw error;
      }
      const alerted = alreadyPersisted ? false : await dispatchChangeAlert(monitor, result);
      if (!(await monitorStore.complete(monitor.id, leaseId, new Date()))) throw new Error("Monitor lease was lost before completion");
      ran.push({ domain: monitor.domain, assets: result.stats.assets, score: result.score.value, changes: result.changeSummary?.events.length ?? 0, alerted });
    } catch (error) {
      const message = (error as Error).message.slice(0, 1_000);
      const retryMinutes = Math.min(60, 5 * 2 ** Math.min(3, Math.max(0, monitor.attempts - 1)));
      await monitorStore.fail(monitor.id, leaseId, message, new Date(Date.now() + retryMinutes * 60_000));
      failed.push({ domain: monitor.domain, error: message });
      console.error(`[cron] monitor ${monitor.id} (${monitor.domain}) failed:`, message);
    }
  };

  await Promise.all(Array.from({ length: Math.min(WORKERS, claimed.length) }, async () => {
    for (;;) {
      const monitor = claimed[cursor++];
      if (!monitor) return;
      await processMonitor(monitor);
    }
  }));

  return NextResponse.json({ ranAt: new Date().toISOString(), claimed: claimed.length, processed: ran.length, failed: failed.length, results: ran, errors: failed });
}
