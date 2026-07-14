import type { GuardianDigest, GuardianEvent, GuardianRecommendation, GuardianSnapshot } from "./types";

export function startOfIsoWeek(value: string | Date): string {
  const date = new Date(value);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}

export function createWeeklyDigest(current: GuardianSnapshot, events: GuardianEvent[], recommendations: GuardianRecommendation[], drift: GuardianDigest["drift"], now = new Date()): GuardianDigest {
  const cutoff = now.getTime() - 7 * 86_400_000;
  const relevant = events.filter((event) => Date.parse(event.observedAt) >= cutoff && Date.parse(event.observedAt) <= now.getTime());
  const newAssets = relevant.filter((event) => ["asset_new", "asset_returned", "auth_surface_new", "api_surface_new", "nonproduction_reachable", "shadow_appeared"].includes(event.type)).length;
  const removedAssets = relevant.filter((event) => event.type === "asset_removed").length;
  const checklist = relevant.filter((event) => event.type === "checklist_changed");
  const important = relevant.filter((event) => event.severity === "critical" || event.severity === "high");
  const reviewItems = [...important.map((event) => ({ title: event.title, detail: event.summary, severity: event.severity })), ...recommendations.slice(0, 5).map((item) => ({ title: item.title, detail: item.suggestedReview, severity: item.priority }))].slice(0, 8);
  const headline = important.length ? `${important.length} important external change${important.length === 1 ? "" : "s"} to review` : drift.headline;
  return {
    orgId: current.orgId, target: current.target, weekOf: startOfIsoWeek(now), generatedAt: now.toISOString(), headline,
    executiveSummary: `Guardian observed ${newAssets} new or returning asset signal(s), ${removedAssets} disappearance(s), and ${checklist.length} security-checklist change(s). ${drift.narrative}`,
    newAssets, removedAssets, importantChanges: important.length,
    checklistImprovements: checklist.filter((event) => event.severity === "info").length,
    checklistRegressions: checklist.filter((event) => event.severity !== "info").length,
    openRecommendations: recommendations.filter((item) => item.status !== "resolved" && item.status !== "dismissed").length,
    shadowAssets: current.metrics.shadowAssets, drift, reviewItems,
  };
}
