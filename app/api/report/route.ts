import { NextRequest } from "next/server";
import type { ScanResult } from "@/lib/types";
import { renderReport } from "@/lib/report/render";
import { rateLimit } from "@/lib/security/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 3_000_000; // 3 MB — a scan result is far smaller in practice.

/** Validate and defensively bound the client-supplied result before rendering. */
function sanitize(raw: unknown): ScanResult | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as ScanResult;
  if (!r.scanId || !r.target || !r.graph || !Array.isArray(r.graph.assets) || !r.score) return null;
  // Bound array sizes to keep rendering cheap and abuse-resistant.
  r.graph.assets = r.graph.assets.slice(0, 500);
  r.graph.edges = Array.isArray(r.graph.edges) ? r.graph.edges.slice(0, 2000) : [];
  r.findings = Array.isArray(r.findings) ? r.findings.slice(0, 200) : [];
  return r;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const limit = rateLimit(`report:${ip}`, 20, 60_000);
  if (!limit.ok) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { "content-type": "application/json" } });
  }

  const text = await req.text();
  if (text.length > MAX_BODY) {
    return new Response(JSON.stringify({ error: "Payload too large" }), { status: 413, headers: { "content-type": "application/json" } });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { "content-type": "application/json" } });
  }

  const result = sanitize(parsed);
  if (!result) {
    return new Response(JSON.stringify({ error: "Invalid scan result" }), { status: 422, headers: { "content-type": "application/json" } });
  }

  try {
    const pdf = await renderReport(result);
    const safeName = result.target.replace(/[^a-z0-9.-]/gi, "_");
    return new Response(pdf, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="outside-${safeName}.pdf"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    console.error("[report] generation failed:", err);
    return new Response(JSON.stringify({ error: "Report generation failed" }), { status: 500, headers: { "content-type": "application/json" } });
  }
}
