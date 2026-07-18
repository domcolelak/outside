import { NextRequest, NextResponse } from "next/server";
import { getAuthStore, getSessionContext } from "@/lib/auth";
import { getAgencyStore } from "@/lib/agency/store";
import { getGuardianStore } from "@/lib/guardian/store";
import { cleanText } from "@/lib/agency/validation";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const ctx = await getSessionContext(); if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const url = new URL(req.url); const agencyId = cleanText(url.searchParams.get("agencyId"), 100); const clientId = cleanText(url.searchParams.get("clientId"), 100); const store = await getAgencyStore(); const workspace = await store.workspace(agencyId); const client = (await store.clients(agencyId)).find((item) => item.id === clientId);
  const ownerOrg = workspace ? await (await getAuthStore()).getOrganization(workspace.ownerOrgId) : null; if (!workspace || ownerOrg?.plan !== "agency" || !client || client.portalMode === "disabled") return NextResponse.json({ error: "Portal unavailable" }, { status: 404 });
  const allowed = ctx.memberships.some((membership) => membership.org.id === client.orgId) || !!(await store.membershipForUser(agencyId, ctx.user.id)) || await store.hasPortalInvite(agencyId, clientId, ctx.user.id); if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [guardian, shares, notes, reports] = await Promise.all([(await getGuardianStore()).overview(client.orgId), store.findingShares(agencyId, clientId), store.notes(agencyId, clientId), store.reports(agencyId, 100)]); const sharedIds = new Set(shares.map((item) => item.recommendationId));
  return NextResponse.json({ workspace: { id: workspace.id, name: workspace.name, branding: workspace.branding }, client: { id: client.id, organizationName: client.organizationName, portalMode: client.portalMode, serviceTier: client.serviceTier }, posture: guardian.targets.map((target) => ({ target: target.target, latest: target.latest, drift: target.drift })), recommendations: guardian.recommendations.filter((recommendation) => sharedIds.has(recommendation.id)), notes: notes.filter((note) => note.visibility === "shared").map((note) => ({ id: note.id, body: note.body, createdAt: note.createdAt })), reports: reports.filter((report) => report.clientOrgId === client.orgId).map((report) => ({ id: report.id, title: report.title, kind: report.kind, createdAt: report.createdAt })), recentChanges: guardian.recentEvents.slice(0, 30), generatedAt: new Date().toISOString() }, { headers: { "cache-control": "private, no-store" } });
}
