import { getGuardianStore } from "@/lib/guardian/store";
import type { GuardianOverview } from "@/lib/guardian/types";
import { clientHealth, portfolioScore } from "./portfolio";
import { getAgencyStore } from "./store";
import type { AgencyRole, PortfolioOverview } from "./types";

async function mapConcurrent<T, R>(items: T[], concurrency: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const result = new Array<R>(items.length); let cursor = 0;
  async function worker() { for (;;) { const index = cursor++; if (index >= items.length) return; result[index] = await work(items[index]!); } }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker)); return result;
}

export async function portfolioOverview(agencyId: string, role: AgencyRole): Promise<PortfolioOverview> {
  const store = await getAgencyStore();
  const workspace = await store.workspace(agencyId); if (!workspace) throw new Error("Agency workspace not found");
  const [clients, groups, activity, slaEvents] = await Promise.all([store.clients(agencyId), store.groups(agencyId), store.activity(agencyId, 80), store.slaEvents(agencyId)]);
  const guardianStore = await getGuardianStore();
  const overviews = await mapConcurrent(clients, 8, async (client) => {
    try { return await guardianStore.overview(client.orgId); } catch { return null; }
  });
  const health = clients.map((client, index) => ({ ...clientHealth(client, overviews[index] ?? null), slaBreaches: slaEvents.filter((event) => event.clientId === client.id && event.breached && event.status !== "resolved").length }));
  const linked = clients.map((client, index) => ({ client, guardian: overviews[index] as GuardianOverview | null }));
  const recentChanges = linked.flatMap(({ client, guardian }) => (guardian?.recentEvents ?? []).map((event) => ({ ...event, clientOrgId: client.orgId, clientName: client.organizationName }))).sort((a,b) => b.observedAt.localeCompare(a.observedAt)).slice(0, 60);
  const topRecommendations = linked.flatMap(({ client, guardian }) => (guardian?.recommendations ?? []).filter((item) => !["resolved", "dismissed"].includes(item.status)).map((item) => ({ ...item, clientOrgId: client.orgId, clientName: client.organizationName }))).sort((a,b) => ({ critical: 5, high: 4, medium: 3, low: 2, info: 1 }[b.priority] - { critical: 5, high: 4, medium: 3, low: 2, info: 1 }[a.priority])).slice(0, 40);
  return { workspace, role, clients: health, groups, portfolioScore: portfolioScore(health), healthyClients: health.filter((item) => item.health === "healthy").length, atRiskClients: health.filter((item) => item.health === "at_risk").length, unknownClients: health.filter((item) => item.health === "unknown").length, totalAssets: health.reduce((sum,item) => sum + item.assets, 0), criticalFindings: health.reduce((sum,item) => sum + item.critical, 0), openRecommendations: health.reduce((sum,item) => sum + item.openRecommendations, 0), slaBreaches: health.reduce((sum,item) => sum + item.slaBreaches, 0), recentChanges, topRecommendations, activity, durable: store.durable, generatedAt: new Date().toISOString() };
}

export async function searchPortfolio(agencyId: string, rawQuery: string) {
  const query = rawQuery.trim().toLowerCase().slice(0, 120); if (query.length < 2) return [];
  const store = await getAgencyStore(); const clients = await store.clients(agencyId); const guardian = await getGuardianStore();
  const overviews = await mapConcurrent(clients, 8, async (client) => { try { return await guardian.overview(client.orgId); } catch { return null; } });
  return clients.flatMap((client, index) => {
    const view = overviews[index]; if (!view) return [];
    const assets = view.targets.flatMap((target) => target.latest.inventory).filter((asset) => [asset.canonical, asset.label, asset.kind, ...asset.technologies].some((value) => value.toLowerCase().includes(query))).map((asset) => ({ type: "asset" as const, clientOrgId: client.orgId, clientName: client.organizationName, target: asset.canonical, label: asset.label, detail: `${asset.kind} · ${asset.technologies.join(", ") || "observed asset"}` }));
    const recommendations = view.recommendations.filter((item) => [item.title, item.why, ...item.affectedAssets].some((value) => value.toLowerCase().includes(query))).map((item) => ({ type: "recommendation" as const, clientOrgId: client.orgId, clientName: client.organizationName, target: item.target, label: item.title, detail: `${item.priority} · ${item.status}` }));
    return [...assets, ...recommendations];
  }).slice(0, 100);
}
