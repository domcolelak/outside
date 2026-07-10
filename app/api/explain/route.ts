import { NextRequest } from "next/server";
import type { Finding, ScanResult } from "@/lib/types";
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

  let body: { result?: ScanResult; finding?: Finding; target?: string };
  try {
    body = JSON.parse(text);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { "content-type": "application/json" } });
  }

  const explainer = getExplainer();

  // Single-finding explanation.
  if (body.finding && body.target) {
    const f = body.finding;
    if (!f.title || !f.observation || !f.concern) {
      return new Response(JSON.stringify({ error: "Invalid finding" }), { status: 422, headers: { "content-type": "application/json" } });
    }
    const explanation = await explainer.explainFinding(f, String(body.target));
    return new Response(JSON.stringify({ explanation, source: explainer.kind }), {
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  // Executive summary. Accept either { result } or a bare ScanResult.
  const result = (body.result ?? (body as unknown as ScanResult));
  if (!result?.target || !result?.score || !Array.isArray(result?.findings)) {
    return new Response(JSON.stringify({ error: "Invalid scan result" }), { status: 422, headers: { "content-type": "application/json" } });
  }
  const summary = await explainer.executiveSummary(result);
  return new Response(JSON.stringify({ summary, source: explainer.kind }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
