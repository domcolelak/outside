import { getAuthStore } from "@/lib/auth";
import type { ScanResult } from "@/lib/types";
import { analyzeGuardianScan } from "./analyze";
import { createWeeklyDigest } from "./digest";
import { calculateDrift } from "./drift";
import { queueGuardianDigestNotifications, queueGuardianEventNotifications } from "./notifications";
import { getGuardianStore } from "./store";
import type { GuardianAnalysis } from "./types";

export interface GuardianProcessResult {
  analysis: GuardianAnalysis;
  notificationsQueued: number;
  digestCreated: boolean;
}

/** Analyze one already-persisted scan for a paid organization. Idempotent by scan id. */
export async function processGuardianScan(orgId: string, result: ScanResult, options: { notify?: boolean; weeklyDigest?: boolean } = {}): Promise<GuardianProcessResult | null> {
  const organization = await (await getAuthStore()).getOrganization(orgId);
  if (!organization || organization.plan === "free") return null;
  const store = await getGuardianStore();
  const history = await store.history(orgId, result.target, 40);
  const priorRecommendations = await store.recommendations(orgId, result.target);
  const existing = history.find((snapshot) => snapshot.scanId === result.scanId);
  const analysis = existing ? {
    snapshot: existing,
    events: (await store.events(orgId, result.target, 500)).filter((event) => event.scanId === result.scanId),
    drift: calculateDrift(history.filter((snapshot) => snapshot.scanId !== result.scanId), existing),
    recommendations: priorRecommendations,
  } : analyzeGuardianScan(orgId, result, history, priorRecommendations);
  if (!existing) await store.saveAnalysis(analysis);

  let notificationsQueued = options.notify ? await queueGuardianEventNotifications(store, analysis) : 0;
  let digestCreated = false;
  if (options.weeklyDigest) {
    const weeklyEvents = await store.events(orgId, result.target, 500);
    const recommendations = await store.recommendations(orgId, result.target);
    const digest = createWeeklyDigest(analysis.snapshot, weeklyEvents, recommendations, analysis.drift);
    digestCreated = await store.saveDigest(digest);
    if (options.notify) notificationsQueued += await queueGuardianDigestNotifications(store, digest);
  }
  return { analysis, notificationsQueued, digestCreated };
}
