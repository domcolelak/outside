import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/persistence";
import { normalizeDomain } from "@/lib/security/target";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Recent scan history for a target: the timeline of exposure scores and asset
 * counts used by the history / graph-diff view. Only real (persisted) passive
 * scans appear here; demo scans are ephemeral.
 */
export async function GET(req: NextRequest) {
  const raw = new URL(req.url).searchParams.get("target") ?? "";
  let domain: string;
  try {
    domain = normalizeDomain(raw);
  } catch {
    return NextResponse.json({ scans: [] });
  }
  const store = await getStore();
  const target = await store.getOrCreateTarget(domain);
  const scans = await store.recentScans(target.id, 20);
  return NextResponse.json({
    durable: store.durable,
    scans: scans.map((s) => ({ id: s.id, finishedAt: s.finishedAt, score: s.scoreValue, assets: s.assetCount, mode: s.mode })),
  });
}
