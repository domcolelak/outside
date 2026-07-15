import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { agencyAccess } from "@/lib/agency/access";
import { getAgencyStore } from "@/lib/agency/store";
import { getGuardianStore } from "@/lib/guardian/store";
import { getMonitorStore } from "@/lib/monitoring";
import { readLimitedJson } from "@/lib/http/body";
import { cleanText } from "@/lib/agency/validation";
import { requireBudgets } from "@/lib/security/ratelimit";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const access = await agencyAccess(req, "agency:read", new URL(req.url).searchParams.get("agencyId"));
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const store = await getAgencyStore(); return NextResponse.json({ jobs: await store.jobs(access.workspace.id), reports: await store.reports(access.workspace.id) });
}

export async function POST(req: NextRequest) {
  const access = await agencyAccess(req, "operations:run", new URL(req.url).searchParams.get("agencyId"));
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await requireBudgets([{ key: `agency:ops:${access.workspace.id}`, limit: 20, windowMs: 3_600_000 }, { key: `agency:ops:actor:${access.actorId}`, limit: 10, windowMs: 3_600_000 }])).ok) return NextResponse.json({ error: "Bulk operation quota exceeded" }, { status: 429 });
  const body = await readLimitedJson(req, 50_000) as Record<string, unknown>;
  const type = body.type === "report" || body.type === "digest" ? body.type : "scan";
  const store = await getAgencyStore(); const clients = await store.clients(access.workspace.id);
  const requested = Array.isArray(body.clientOrgIds) ? body.clientOrgIds.map((item) => cleanText(item, 100)) : [];
  const orgIds = [...new Set(requested)].filter((orgId) => clients.some((client) => client.orgId === orgId)).slice(0, 100);
  if (!orgIds.length) return NextResponse.json({ error: "Select at least one portfolio client" }, { status: 422 });
  const key = cleanText(req.headers.get("idempotency-key"), 200) || createHash("sha256").update(`${access.workspace.id}:${access.actorId}:${type}:${orgIds.sort().join(",")}:${new Date().toISOString().slice(0, 16)}`).digest("hex");
  const scheduledText = cleanText(body.scheduledFor, 40); const scheduledFor = type === "scan" && scheduledText && !Number.isNaN(Date.parse(scheduledText)) ? new Date(scheduledText) : new Date(); if (scheduledFor.getTime() < Date.now() - 60_000 || scheduledFor.getTime() > Date.now() + 30 * 86_400_000) return NextResponse.json({ error: "Scan schedule must be within the next 30 days" }, { status: 422 }); const job = await store.createJob({ agencyId: access.workspace.id, type, idempotencyKey: key, clientOrgIds: orgIds, payload: { requestedAt: new Date().toISOString(), scheduledFor: scheduledFor.toISOString() }, createdBy: access.actorId });
  if (job.status === "completed" || job.status === "partially_failed") return NextResponse.json({ job, result: job.result, idempotentReplay: true });

  let result: unknown; let status: "completed" | "partially_failed" | "failed" = "completed";
  if (type === "scan") result = { scheduledMonitors: await (await getMonitorStore()).scheduleNow(orgIds, scheduledFor), scheduledFor: scheduledFor.toISOString(), clientCount: orgIds.length };
  else {
    const guardian = await getGuardianStore(); const periodEnd = new Date(); const periodStart = new Date(periodEnd.getTime() - (type === "digest" ? 7 : 30) * 86_400_000);
    const generated = await Promise.allSettled(orgIds.map(async (orgId) => {
      const linked = clients.find((client) => client.orgId === orgId)!; const overview = await guardian.overview(orgId);
      const content = { orgId, client: linked.organizationName, generatedAt: periodEnd.toISOString(), targets: overview.targets.length, assets: overview.targets.reduce((sum, target) => sum + target.latest.metrics.assets, 0), openRecommendations: overview.recommendations.filter((item) => !["resolved", "dismissed"].includes(item.status)).length, critical: overview.recommendations.filter((item) => item.priority === "critical" && !["resolved", "dismissed"].includes(item.status)).length, recentChanges: overview.recentEvents.slice(0, 20), exposureTrend: overview.targets.map((target) => ({ target: target.target, drift: target.drift })) };
      const report = await store.createReport({ agencyId: access.workspace.id, clientOrgId: orgId, periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString(), kind: type === "digest" ? "executive" : "client", title: `${linked.organizationName} ${type === "digest" ? "weekly executive digest" : "client security report"}`, content, branding: access.workspace.branding, createdBy: access.actorId });
      return { reportId: report.id, ...content };
    }));
    const succeeded = generated.flatMap((item) => item.status === "fulfilled" ? [item.value] : []);
    const failed = generated.flatMap((item, index) => item.status === "rejected" ? [{ orgId: orgIds[index], error: "Report generation failed" }] : []);
    result = { reports: succeeded, failed }; status = failed.length === orgIds.length ? "failed" : failed.length ? "partially_failed" : "completed";
  }
  const finished = await store.finishJob(access.workspace.id, job.id, status, result);
  await store.appendActivity({ agencyId: access.workspace.id, clientOrgId: null, actorId: access.actorId, type: `bulk.${type}`, message: `Bulk ${type} ${status.replace("_", " ")} for ${orgIds.length} clients`, detail: { jobId: job.id, clientCount: orgIds.length, status } });
  return NextResponse.json({ job: finished, result }, { status: 202 });
}
