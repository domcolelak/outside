import { NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { getRecommendationStatuses, listAudit, setRecommendationStatus } from "@/lib/aegis/store";
import { rateLimit } from "@/lib/security/ratelimit";
import { normalizeDomain } from "@/lib/security/target";
import type { RecommendationStatus } from "@/lib/aegis/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID: RecommendationStatus[] = ["open", "acknowledged", "in_progress", "resolved", "dismissed"];

/** Current statuses + recent audit for a target's recommendations. */
export async function GET(req: NextRequest) {
  const raw = new URL(req.url).searchParams.get("target") ?? "";
  let target: string;
  try {
    target = normalizeDomain(raw);
  } catch {
    return NextResponse.json({ statuses: {}, audit: [] });
  }
  const statuses = Object.fromEntries(await getRecommendationStatuses(target));
  return NextResponse.json({ statuses, audit: await listAudit(target, 30) });
}

/** Update a recommendation's status (acknowledge / start / resolve / dismiss). */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`rec:${ip}`, 40, 60_000).ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  let body: { target?: string; recId?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  let target: string;
  try {
    target = normalizeDomain(body.target ?? "");
  } catch {
    // Demo targets use reserved TLDs; accept the raw value for status tracking.
    target = String(body.target ?? "").trim().toLowerCase();
  }
  const recId = String(body.recId ?? "");
  const status = body.status as RecommendationStatus;
  if (!target || !recId || !VALID.includes(status)) {
    return NextResponse.json({ error: "Invalid recommendation update" }, { status: 422 });
  }

  const ctx = await getSessionContext();
  await setRecommendationStatus(target, recId, status, ctx?.user.email ?? null ?? undefined);
  return NextResponse.json({ ok: true, status });
}
