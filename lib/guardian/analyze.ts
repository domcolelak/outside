import type { ScanResult } from "@/lib/types";
import { evaluateChecklist } from "./checklist";
import { correlateGuardianEvents } from "./correlate";
import { calculateDrift } from "./drift";
import { generateRecommendations, mergeRecommendationState } from "./recommendations";
import { createGuardianSnapshot } from "./snapshot";
import type { GuardianAnalysis, GuardianRecommendation, GuardianSnapshot } from "./types";

export function analyzeGuardianScan(orgId: string, result: ScanResult, history: GuardianSnapshot[] = [], priorRecommendations: GuardianRecommendation[] = []): GuardianAnalysis {
  const checklist = evaluateChecklist(result);
  const snapshot = createGuardianSnapshot(orgId, result, checklist);
  const ordered = history.filter((item) => item.scanId !== result.scanId).sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
  const previous = ordered.at(-1);
  const drift = calculateDrift(ordered, snapshot);
  const events = correlateGuardianEvents({ current: snapshot, previous, history: ordered, changes: result.changeSummary?.events });
  const recommendations = mergeRecommendationState(generateRecommendations(snapshot, events), priorRecommendations);
  return { snapshot, events, drift, recommendations };
}
