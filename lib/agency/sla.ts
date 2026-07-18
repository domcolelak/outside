import type { GuardianRecommendation } from "@/lib/guardian/types";
import type { AgencyClient, AgencySlaEvent } from "./types";
import type { AgencyStore } from "./store-model";

export async function synchronizeClientSla(store: AgencyStore, client: AgencyClient, recommendations: GuardianRecommendation[], at = new Date()): Promise<AgencySlaEvent[]> {
  const observedIds = new Set(recommendations.map((item) => item.id));
  await Promise.all(recommendations.map((recommendation) => {
    const openedAt = recommendation.firstObservedAt;
    const dueAt = new Date(new Date(openedAt).getTime() + client.slaResponseMinutes * 60_000).toISOString();
    return store.upsertSlaEvent({ agencyId: client.agencyId, clientId: client.id, findingId: recommendation.id, priority: recommendation.priority, openedAt, dueAt, lastObservedAt: recommendation.lastObservedAt || at.toISOString(), resolved: recommendation.status === "resolved" || recommendation.status === "dismissed" });
  }));
  const existing = await store.slaEvents(client.agencyId, client.id);
  await Promise.all(existing.filter((event) => event.status !== "resolved" && !observedIds.has(event.findingId)).map((event) => store.upsertSlaEvent({ agencyId: client.agencyId, clientId: client.id, findingId: event.findingId, priority: event.priority, openedAt: event.openedAt, dueAt: event.dueAt, lastObservedAt: at.toISOString(), resolved: true })));
  return store.slaEvents(client.agencyId, client.id);
}
