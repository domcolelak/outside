import { NextRequest, NextResponse } from "next/server";
import { getAuthStore } from "@/lib/auth";
import { getAgencyStore } from "@/lib/agency/store";
import { queueAgencyClientNotifications } from "@/lib/agency/notifications";
import { synchronizeClientSla } from "@/lib/agency/sla";
import { getGuardianStore } from "@/lib/guardian/store";
import { authorizeCronHeader } from "@/lib/security/cron-auth";
import type { AgencyClient, AgencyWorkspace } from "@/lib/agency/types";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";
async function parallel<T>(items: T[], concurrency: number, work: (item: T) => Promise<void>) { let cursor = 0; await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => { while (cursor < items.length) { const item = items[cursor++]; if (item) await work(item); } })); }

export async function POST(req: NextRequest) {
  const authorization = authorizeCronHeader(req.headers.get("authorization")); if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const agencyStore = await getAgencyStore(), guardian = await getGuardianStore(), auth = await getAuthStore(); const workspaces = await agencyStore.allWorkspaces(); const eligible: Array<{ workspace: AgencyWorkspace; client: AgencyClient }> = [];
  for (const workspace of workspaces) { if ((await auth.getOrganization(workspace.ownerOrgId))?.plan !== "agency") continue; for (const client of await agencyStore.clients(workspace.id)) if (client.status === "active") eligible.push({ workspace, client }); }
  const url = new URL(req.url), after = url.searchParams.get("after") ?? "", limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit")) || 200)); const batch = eligible.sort((left, right) => left.client.id.localeCompare(right.client.id)).filter((item) => item.client.id > after).slice(0, limit); const outcomes: Array<{ notifications: number; breaches: number }> = [];
  await parallel(batch, 6, async ({ workspace, client }) => { const overview = await guardian.overview(client.orgId); const sla = await synchronizeClientSla(agencyStore, client, overview.recommendations); const recent = overview.recentEvents.filter((event) => Date.now() - new Date(event.observedAt).getTime() < 8 * 86_400_000); const notifications = await queueAgencyClientNotifications(guardian, workspace, client, recent); let breaches = 0; for (const event of sla.filter((item) => item.breached && !item.escalatedAt && item.status !== "resolved")) { await agencyStore.updateSlaEvent(workspace.id, event.id, { escalated: true }); breaches += 1; } outcomes.push({ notifications, breaches }); });
  const expiredReportSharesPurged = await agencyStore.purgeExpiredReportShares(new Date()), notificationsQueued = outcomes.reduce((sum, item) => sum + item.notifications, 0), slaBreaches = outcomes.reduce((sum, item) => sum + item.breaches, 0); const nextCursor = batch.length === limit ? batch.at(-1)?.client.id ?? null : null; return NextResponse.json({ workspaces: workspaces.length, eligibleClients: eligible.length, clientsProcessed: batch.length, notificationsQueued, slaBreaches, expiredReportSharesPurged, nextCursor });
}
