import { NextRequest, NextResponse } from "next/server";
import { readLimitedJson, RequestBodyError } from "@/lib/http/body";
import { sanitizeScanResult } from "@/lib/http/scan-input";
import { createShare } from "@/lib/share/shares";
import { clientIdentity, rateLimit } from "@/lib/security/ratelimit";
import { recordFunnelEvent } from "@/lib/observability/metrics";
import { APP_URL } from "@/lib/config/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Persist a shareable, unlisted snapshot of a scan result the caller holds. */
export async function POST(req: NextRequest) {
  if (!(await rateLimit(`share:${clientIdentity(req)}`, 20, 60_000)).ok) {
    return NextResponse.json({ error: "Too many share links. Try again shortly." }, { status: 429 });
  }
  let raw: unknown;
  try {
    raw = await readLimitedJson(req, 750_000);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: error instanceof RequestBodyError ? error.status : 400 });
  }
  const result = sanitizeScanResult((raw && typeof raw === "object" ? (raw as { result?: unknown }).result : undefined) ?? raw);
  if (!result) return NextResponse.json({ error: "Invalid scan result" }, { status: 422 });

  try {
    const { token } = await createShare(result);
    recordFunnelEvent("report_shared", result.isDemo ? "demo" : "real");
    return NextResponse.json({ token, url: `${APP_URL}/r/${token}` }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not create a share link right now." }, { status: 500 });
  }
}
