import { NextResponse } from "next/server";
import { releaseInfo } from "@/lib/config/build-info";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Process liveness only; never performs network or database work. */
export async function GET() {
  return NextResponse.json({ status: "ok", time: new Date().toISOString(), release: releaseInfo() }, { headers: { "cache-control": "no-store" } });
}
