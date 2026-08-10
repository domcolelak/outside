import { NextResponse } from "next/server";
import { databaseReady } from "@/lib/db/prisma";
import { storageMode } from "@/lib/config/storage";
import { releaseInfo } from "@/lib/config/build-info";
import { canRenderLocalized } from "@/lib/report/fonts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Deployment readiness. Detailed provider state remains in private telemetry. */
export async function GET() {
  try {
    const mode = storageMode();
    const ready = mode === "memory" ? true : await databaseReady();
    // Reported, not gated: a missing report font degrades PDFs to English
    // rather than breaking the deployment, and that degradation is otherwise
    // invisible until somebody opens a report.
    return NextResponse.json({ status: ready ? "ready" : "unready", persistence: mode, localizedReports: canRenderLocalized(), release: releaseInfo() }, { status: ready ? 200 : 503, headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "unready" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
