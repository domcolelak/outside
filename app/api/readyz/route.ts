import { NextResponse } from "next/server";
import { databaseReady } from "@/lib/db/prisma";
import { storageMode } from "@/lib/config/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Deployment readiness. Detailed provider state remains in private telemetry. */
export async function GET() {
  try {
    const mode = storageMode();
    const ready = mode === "memory" ? true : await databaseReady();
    return NextResponse.json({ status: ready ? "ready" : "unready", persistence: mode }, { status: ready ? 200 : 503, headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "unready" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
