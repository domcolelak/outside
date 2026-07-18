import { NextRequest, NextResponse } from "next/server";
import { enterpriseAccess } from "@/lib/enterprise/access";
import { renderEnterpriseReport } from "@/lib/enterprise/report-render";
import { buildEnterpriseReport, reportCsv, type EnterpriseReportData } from "@/lib/enterprise/reporting";
import { getEnterpriseStore } from "@/lib/enterprise/store";
import { CapacityError, withConcurrency } from "@/lib/security/concurrency";
import { clientIdentity, requireBudgets } from "@/lib/security/ratelimit";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const access = await enterpriseAccess(req, "reports:manage", url.searchParams.get("orgId"));
  if (!access) return NextResponse.json({ error: "Enterprise reporting permission required" }, { status: 403 });
  if (!(await requireBudgets([
    { key: `enterprise:report:${access.workspace.id}`, limit: 100, windowMs: 86_400_000 },
    { key: `enterprise:report:${clientIdentity(req)}`, limit: 20, windowMs: 60_000 },
  ])).ok) return NextResponse.json({ error: "Report generation limit exceeded" }, { status: 429 });

  const kind = (["executive", "compliance", "audit"].includes(url.searchParams.get("kind") ?? "")
    ? url.searchParams.get("kind")
    : "executive") as EnterpriseReportData["kind"];
  const format = url.searchParams.get("format") ?? "json";
  const store = await getEnterpriseStore();
  const overview = await store.overview(access.workspace.id);
  if (!overview) return NextResponse.json({ error: "Enterprise workspace not found" }, { status: 404 });

  const audit = await store.auditEvents(access.workspace.id, kind === "audit" ? 5000 : 500);
  const report = await buildEnterpriseReport(overview, audit, kind);
  const name = `outside-${kind}-${access.workspace.orgId}`;
  const recordGeneration = () => store.appendAudit({
    workspaceId: access.workspace.id,
    actorType: access.actorType,
    actorId: access.actorId,
    action: "enterprise.report.generated",
    resourceType: "report",
    resourceId: null,
    requestId: req.headers.get("x-request-id"),
    ipHash: null,
    detail: { kind, format },
  });

  if (format === "csv") {
    const body = reportCsv(report);
    await recordGeneration();
    return new NextResponse(body, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}.csv"`, "cache-control": "no-store" } });
  }
  if (format === "pdf") {
    try {
      const pdf = await withConcurrency("enterprise-report:global", 3, 60_000, () => renderEnterpriseReport(report));
      await recordGeneration();
      return new Response(pdf, { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${name}.pdf"`, "cache-control": "no-store" } });
    } catch (error) {
      return NextResponse.json({ error: error instanceof CapacityError ? error.message : "Report generation failed" }, { status: error instanceof CapacityError ? 503 : 500 });
    }
  }
  await recordGeneration();
  return NextResponse.json(report, { headers: { "content-disposition": `attachment; filename="${name}.json"`, "cache-control": "no-store" } });
}
