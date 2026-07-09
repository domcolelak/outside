import { NextRequest } from "next/server";
import type { ScanResult } from "@/lib/types";
import { getExplainer } from "@/lib/ai/explainer";
import { rateLimit } from "@/lib/security/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/explain { result } -> { summary, source }. Read-only over the result. */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`explain:${ip}`, 15, 60_000).ok) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { "content-type": "application/json" } });
  }

  const text = await req.text();
  if (text.length > 3_000_000) return new Response(JSON.stringify({ error: "Payload too large" }), { status: 413 });

  let result: ScanResult;
  try {
    result = JSON.parse(text) as ScanResult;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { "content-type": "application/json" } });
  }
  if (!result?.target || !result?.score || !Array.isArray(result?.findings)) {
    return new Response(JSON.stringify({ error: "Invalid scan result" }), { status: 422, headers: { "content-type": "application/json" } });
  }

  const explainer = getExplainer();
  const summary = await explainer.executiveSummary(result);
  return new Response(JSON.stringify({ summary, source: explainer.kind }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
