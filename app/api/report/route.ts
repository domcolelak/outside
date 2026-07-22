import { NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { targetEntitlement } from "@/lib/auth/entitlements";
import { readLimitedJson, RequestBodyError } from "@/lib/http/body";
import { sanitizeScanResult } from "@/lib/http/scan-input";
import { renderReport } from "@/lib/report/render";
import { CapacityError, withConcurrency } from "@/lib/security/concurrency";
import { clientIdentity, requireBudgets } from "@/lib/security/ratelimit";
import { recordUsage } from "@/lib/usage/record";
import { operationalLog } from "@/lib/observability/log";
import { recordReportOperation } from "@/lib/observability/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown, status: number) { return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } }); }

export async function POST(req: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) return json({ error: "Not authenticated" }, 401);
  let raw: unknown;
  try { raw = await readLimitedJson(req, 1_000_000); }
  catch (error) { return json({ error: (error as Error).message }, error instanceof RequestBodyError ? error.status : 400); }
  const result = sanitizeScanResult(raw);
  if (!result) return json({ error: "Invalid scan result" }, 422);
  const entitlement = await targetEntitlement(ctx, result.target, { allowDemo: true });
  if (!entitlement) return json({ error: "Verified target access is required" }, 403);
  const limit = await requireBudgets([
    { key: "report:global", limit: 120, windowMs: 60_000 },
    { key: `report:client:${clientIdentity(req)}`, limit: 10, windowMs: 60_000 },
    { key: `report:user:${ctx.user.id}`, limit: 50, windowMs: 24 * 60 * 60_000 },
    { key: `report:org:${entitlement.orgId}`, limit: 500, windowMs: 30 * 24 * 60 * 60_000 },
  ]);
  if (!limit.ok) return json({ error: "Report usage limit exceeded", retryAfter: limit.retryAfter }, 429);
  const startedAt = performance.now();
  try {
    const pdf = await withConcurrency("report:global", 4, 60_000, () => renderReport(result));
    await recordUsage(entitlement.orgId, ctx.user.id, "report");
    const safeName = result.target.replace(/[^a-z0-9.-]/gi, "_");
    recordReportOperation("success", performance.now() - startedAt);
    return new Response(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="outside-${safeName}.pdf"`, "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof CapacityError) { recordReportOperation("capacity", performance.now() - startedAt); return json({ error: error.message }, 503); }
    recordReportOperation("failed", performance.now() - startedAt);
    operationalLog("error", "report.generation_failed", { organizationId: entitlement.orgId }, error);
    return json({ error: "Report generation failed" }, 500);
  }
}
