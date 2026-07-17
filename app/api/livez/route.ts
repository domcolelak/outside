import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Process liveness only; never performs network or database work. */
export async function GET() {
  return NextResponse.json({ status: "ok", time: new Date().toISOString() }, { headers: { "cache-control": "no-store" } });
}
