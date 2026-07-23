import { NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { recordIncident, isDetectorCategory, type IncidentVerdict } from "@/lib/evolution/incidents";
import { operationalLog } from "@/lib/observability/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VERDICTS: IncidentVerdict[] = ["false_positive", "confirmed"];

/**
 * Record a founder verdict on a finding — false positive, or a confirmed real
 * incident. Evolution learns per-detector reliability from these and bounded-
 * down-weights the confidence of noisy detectors' future findings. It never
 * silences a detector and never inflates confidence.
 */
export async function POST(req: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { category?: unknown; verdict?: unknown } | null;
  const category = typeof body?.category === "string" ? body.category : "";
  const verdict = body?.verdict;
  if (!isDetectorCategory(category)) return NextResponse.json({ error: "Unknown detector category" }, { status: 400 });
  if (typeof verdict !== "string" || !VERDICTS.includes(verdict as IncidentVerdict)) {
    return NextResponse.json({ error: "verdict must be 'false_positive' or 'confirmed'" }, { status: 400 });
  }

  await recordIncident({ category, verdict: verdict as IncidentVerdict, actor: ctx.user.email });
  operationalLog("info", "evolution.incident", { category, verdict });
  return NextResponse.json({ ok: true, category, verdict });
}
