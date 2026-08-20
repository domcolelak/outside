import { NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { isFounder } from "@/lib/auth/founder";
import { recordIncident, isDetectorCategory, type IncidentVerdict } from "@/lib/evolution/incidents";
import { operationalLog } from "@/lib/observability/log";
import { readLimitedJson, RequestBodyError } from "@/lib/http/body";
import { clientIdentity, requireBudgets } from "@/lib/security/ratelimit";

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
  if (!isFounder(ctx)) return NextResponse.json({ error: "Evolution is restricted to the product owner." }, { status: 403 });

  const budget = await requireBudgets([
    { key: `evolution:incident:user:${ctx.user.id}`, limit: 60, windowMs: 60_000 },
    { key: `evolution:incident:client:${clientIdentity(req)}`, limit: 120, windowMs: 60_000 },
  ]);
  if (!budget.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "retry-after": String(budget.retryAfter) } });

  let body: { category?: unknown; verdict?: unknown } | null;
  try {
    body = await readLimitedJson(req, 4_096) as typeof body;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid request body" }, { status: error instanceof RequestBodyError ? error.status : 400 });
  }
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
