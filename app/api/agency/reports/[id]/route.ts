import { NextRequest, NextResponse } from "next/server";
import { agencyAccess } from "@/lib/agency/access";
import { getAgencyStore } from "@/lib/agency/store";
import { renderAgencyReport } from "@/lib/agency/report";
import { getAuthStore, getSessionContext } from "@/lib/auth";
import { withConcurrency, CapacityError } from "@/lib/security/concurrency";
import { cleanText } from "@/lib/agency/validation";
import { readLimitedJson } from "@/lib/http/body";
import { isValidEmail } from "@/lib/auth/validation";
import { sendDurably } from "@/lib/email/outbox";
import { agencyReportReadyEmail } from "@/lib/email/templates";
import { APP_URL } from "@/lib/config/runtime";
import { createHash, randomBytes } from "node:crypto";
import { requireBudgets } from "@/lib/security/ratelimit";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";
async function authorizedReport(req: NextRequest, id: string) {
  const agencyId = cleanText(new URL(req.url).searchParams.get("agencyId"), 100); const store = await getAgencyStore(); const [report, workspace] = await Promise.all([store.report(agencyId, id), store.workspace(agencyId)]); const ownerOrg = workspace ? await (await getAuthStore()).getOrganization(workspace.ownerOrgId) : null; if (!report || ownerOrg?.plan !== "agency") return null;
  const shareToken = cleanText(new URL(req.url).searchParams.get("share"), 200); if (shareToken && await store.authorizeReportShare(agencyId, id, createHash("sha256").update(shareToken).digest("hex"), new Date())) return report;
  if (await agencyAccess(req, "clients:read", agencyId)) return report;
  const ctx = await getSessionContext(); if (!ctx || !report.clientOrgId) return null; const client = (await store.clients(agencyId)).find((item) => item.orgId === report.clientOrgId); if (!client || client.portalMode === "disabled") return null;
  const allowed = ctx.memberships.some((membership) => membership.org.id === client.orgId) || await store.hasPortalInvite(agencyId, client.id, ctx.user.id); return allowed ? report : null;
}
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const report = await authorizedReport(req, (await params).id); if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });
  try { const pdf = await withConcurrency("agency-report:global", 4, 60_000, () => renderAgencyReport(report)); const filename = report.title.replace(/[^a-z0-9.-]+/gi, "_").slice(0, 100); return new Response(pdf, { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${filename}.pdf"`, "cache-control": "private, no-store" } }); } catch (error) { return NextResponse.json({ error: error instanceof CapacityError ? error.message : "Report rendering failed" }, { status: error instanceof CapacityError ? 503 : 500 }); }
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const agencyId = cleanText(new URL(req.url).searchParams.get("agencyId"), 100); const access = await agencyAccess(req, "reports:generate", agencyId); if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 }); const report = await (await getAgencyStore()).report(agencyId, (await params).id); if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });
  const body = await readLimitedJson(req, 10_000) as Record<string, unknown>; const to = cleanText(body.to, 254).toLowerCase(); if (!isValidEmail(to)) return NextResponse.json({ error: "Valid recipient required" }, { status: 422 }); const recipientHash = createHash("sha256").update(to).digest("hex"); if (!(await requireBudgets([{ key: `agency:report-send:${agencyId}`, limit: 100, windowMs: 86_400_000 }, { key: `agency:report-send:${agencyId}:${access.actorId}`, limit: 30, windowMs: 3_600_000 }, { key: `agency:report-recipient:${recipientHash}`, limit: 10, windowMs: 86_400_000 }])).ok) return NextResponse.json({ error: "Report delivery quota exceeded" }, { status: 429 }); const shareToken = randomBytes(32).toString("base64url"); const store = await getAgencyStore(); await store.createReportShare({ agencyId, reportId: report.id, email: to, tokenHash: createHash("sha256").update(shareToken).digest("hex"), expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString() }); const baseUrl = access.workspace.branding.whiteLabel && access.workspace.branding.customDomain ? `https://${access.workspace.branding.customDomain}` : APP_URL; const url = `${baseUrl}/api/agency/reports/${report.id}?agencyId=${agencyId}&share=${encodeURIComponent(shareToken)}`; await sendDurably(agencyReportReadyEmail(to, report.title, url, access.workspace.name, access.workspace.branding), `agency-report:${report.id}:${to}`); return NextResponse.json({ ok: true });
}
