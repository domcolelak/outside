import { NextRequest, NextResponse } from "next/server";
import { readLimitedJson, RequestBodyError } from "@/lib/http/body";
import { sanitizeScanResult } from "@/lib/http/scan-input";
import { createShare } from "@/lib/share/shares";
import { verifyShareProof } from "@/lib/share/proof";
import { clientIdentity, requireBudgets } from "@/lib/security/ratelimit";
import { recordFunnelEvent } from "@/lib/observability/metrics";
import { APP_URL } from "@/lib/config/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Persist a shareable, unlisted snapshot issued by the scan pipeline. */
export async function POST(req: NextRequest) {
  if (!(await requireBudgets([
    { key: "share:global", limit: 300, windowMs: 60_000 },
    { key: `share:client:${clientIdentity(req)}`, limit: 20, windowMs: 60_000 },
  ])).ok) {
    return NextResponse.json({ error: "Too many share links. Try again shortly." }, { status: 429 });
  }
  let raw: unknown;
  try {
    raw = await readLimitedJson(req, 750_000);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: error instanceof RequestBodyError ? error.status : 400 });
  }
  const submitted = (raw && typeof raw === "object" ? (raw as { result?: unknown }).result : undefined) ?? raw;
  const proof = submitted && typeof submitted === "object" && typeof (submitted as { shareProof?: unknown }).shareProof === "string"
    ? (submitted as { shareProof: string }).shareProof
    : undefined;
  const result = sanitizeScanResult(submitted);
  if (!result) return NextResponse.json({ error: "Invalid scan result" }, { status: 422 });
  if (!verifyShareProof(result, proof)) return NextResponse.json({ error: "Scan proof is missing or expired. Run the scan again before sharing." }, { status: 403 });

  try {
    const { token } = await createShare(result);
    recordFunnelEvent("report_shared", result.isDemo ? "demo" : "real");
    return NextResponse.json({ token, url: `${APP_URL}/r/${token}` }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not create a share link right now." }, { status: 500 });
  }
}
