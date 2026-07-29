import type { GuardianDigest, GuardianEvent, GuardianRecommendation, GuardianSnapshot } from "./types";
import { buildChangeStatus, buildDigestCards, changeSummarySentence } from "./digest-content";
import { appUrl } from "@/lib/config/runtime";

export function startOfIsoWeek(value: string | Date): string {
  const date = new Date(value);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}

/**
 * Build the weekly digest. Deterministic by construction: every number comes
 * from counting observations and every string is assembled from those counts, so
 * the same inputs always produce the same digest. Nothing here calls a model.
 */
export function createWeeklyDigest(
  current: GuardianSnapshot,
  events: GuardianEvent[],
  recommendations: GuardianRecommendation[],
  drift: GuardianDigest["posture"]["drift"],
  now = new Date(),
  baseUrl = appUrl(),
): GuardianDigest {
  const windowStartMs = now.getTime() - 7 * 86_400_000;
  const relevant = events.filter((event) => {
    const observed = Date.parse(event.observedAt);
    return observed >= windowStartMs && observed <= now.getTime();
  });

  const changeStatus = buildChangeStatus(relevant, drift);
  const cards = buildDigestCards(recommendations, baseUrl, windowStartMs);

  return {
    orgId: current.orgId,
    target: current.target,
    weekOf: startOfIsoWeek(now),
    generatedAt: now.toISOString(),
    headline: changeStatus.headline,
    executiveSummary: `${changeSummarySentence(changeStatus)} ${drift.narrative}`,
    changeStatus,
    posture: { drift, shadowAssets: current.metrics.shadowAssets },
    recommendations: cards,
    openRecommendations: cards.total,
  };
}
