import type { GuardianOverview } from "@/lib/guardian/types";
import type { AgencyClient, PortfolioClientHealth } from "./types";

const severityRank: Record<string, number> = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };

export function clientHealth(client: AgencyClient, guardian: GuardianOverview | null, now = new Date()): PortfolioClientHealth {
  const snapshots = guardian?.targets.map((target) => target.latest) ?? [];
  const recommendations = guardian?.recommendations.filter((item) => !["resolved", "dismissed"].includes(item.status)) ?? [];
  const events = guardian?.recentEvents ?? [];
  const score = snapshots.length ? Math.round(snapshots.reduce((sum, item) => sum + item.exposureScore, 0) / snapshots.length) : null;
  const critical = recommendations.filter((item) => item.priority === "critical").length;
  const high = recommendations.filter((item) => item.priority === "high").length;
  const lastObservedAt = snapshots.map((item) => item.observedAt).sort().at(-1) ?? null;
  const stale = !lastObservedAt || now.getTime() - new Date(lastObservedAt).getTime() > 14 * 86_400_000;
  const health = score === null || stale ? "unknown" : critical > 0 || score < 40 ? "at_risk" : high > 0 || score < 60 ? "watch" : "healthy";
  const slaBreaches = events.filter((event) => (severityRank[event.severity] ?? 0) >= 4 && now.getTime() - new Date(event.observedAt).getTime() > client.slaResponseMinutes * 60_000).length;
  return {
    client, exposureScore: score, health,
    assets: snapshots.reduce((sum, item) => sum + item.metrics.assets, 0), critical, high,
    openRecommendations: recommendations.length,
    shadowAssets: snapshots.reduce((sum, item) => sum + item.metrics.shadowAssets, 0),
    slaBreaches, lastObservedAt,
  };
}

export function portfolioScore(clients: PortfolioClientHealth[]): number | null {
  const observed = clients.filter((item) => item.exposureScore !== null);
  if (!observed.length) return null;
  const weight = (item: PortfolioClientHealth) => Math.max(1, Math.sqrt(item.assets || 1));
  return Math.round(observed.reduce((sum, item) => sum + item.exposureScore! * weight(item), 0) / observed.reduce((sum, item) => sum + weight(item), 0));
}
