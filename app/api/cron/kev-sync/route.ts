import { NextRequest, NextResponse } from "next/server";
import { authorizeCronHeader } from "@/lib/security/cron-auth";
import { currentKevIndex, syncKev } from "@/lib/analysis/kev";
import { operationalLog } from "@/lib/observability/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Refresh the CISA Known Exploited Vulnerabilities catalogue used by the
 * known-vulnerability correlation. Scheduled daily; safe to call more often. */
export async function GET(req: NextRequest) {
  const authorization = authorizeCronHeader(req.headers.get("authorization"));
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  try {
    const result = await syncKev({ signal: AbortSignal.timeout(30_000) });
    operationalLog("info", "kev.sync_succeeded", { count: result.count, source: result.source });
    return NextResponse.json({ ranAt: result.syncedAt, ...result });
  } catch (error) {
    operationalLog("error", "kev.sync_failed", {}, error);
    // A failed refresh keeps the last good catalogue (or the static fallback).
    const index = currentKevIndex();
    return NextResponse.json({ error: "KEV sync failed", cachedCount: index.size, cachedSyncedAt: index.syncedAt }, { status: 502 });
  }
}
