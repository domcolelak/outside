import { NextRequest, NextResponse } from "next/server";
import { isFunnelEvent } from "@/lib/analytics/events";
import { readLimitedJson, RequestBodyError } from "@/lib/http/body";
import { clientIdentity, rateLimit } from "@/lib/security/ratelimit";
import { recordFunnelEvent } from "@/lib/observability/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!(await rateLimit(`analytics:${clientIdentity(req)}`, 120, 60_000)).ok) return new NextResponse(null, { status: 204 });
  try {
    const body = await readLimitedJson(req, 4_000) as Record<string, unknown>;
    if (!isFunnelEvent(body.event)) return NextResponse.json({ error: "Unknown analytics event" }, { status: 422 });
    const mode = body.mode === "demo" ? "demo" : body.mode === "real" ? "real" : "product";
    recordFunnelEvent(body.event, mode);
    return new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof RequestBodyError ? error.message : "Invalid analytics event" }, { status: error instanceof RequestBodyError ? error.status : 400 });
  }
}
