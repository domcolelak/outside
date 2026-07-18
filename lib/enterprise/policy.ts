import type { EnterprisePolicy, EnterpriseRiskException } from "./types";

export interface ScoreInput { baseScore: number; severity: "info" | "low" | "medium" | "high" | "critical"; assetTags: string[]; evidenceConfidence: number; }
export interface ScoreResult { score: number; appliedRules: Array<{ policyId: string; rule: string; delta: number }>; }

export function applyScoringPolicies(input: ScoreInput, policies: EnterprisePolicy[]): ScoreResult {
  let score = input.baseScore; const appliedRules: ScoreResult["appliedRules"] = [];
  for (const policy of policies.filter((item) => item.enabled && item.kind === "scoring")) {
    const rules = Array.isArray(policy.document.rules) ? policy.document.rules : [];
    for (const raw of rules) {
      if (!raw || typeof raw !== "object") continue; const rule = raw as Record<string, unknown>;
      const severity = typeof rule.severity === "string" ? rule.severity : null; const tag = typeof rule.assetTag === "string" ? rule.assetTag : null; const delta = Number(rule.delta);
      if (!Number.isFinite(delta) || Math.abs(delta) > 50 || severity && severity !== input.severity || tag && !input.assetTags.includes(tag)) continue;
      score += delta; appliedRules.push({ policyId: policy.id, rule: String(rule.name ?? "custom rule"), delta });
    }
  }
  return { score: Math.max(0, Math.min(100, Math.round(score * Math.max(0.5, input.evidenceConfidence)))), appliedRules };
}

export function activeRiskException(exceptions: EnterpriseRiskException[], subjectType: string, subjectId: string, now = new Date()): EnterpriseRiskException | null {
  return exceptions.find((item) => item.subjectType === subjectType && item.subjectId === subjectId && item.status === "approved" && new Date(item.expiresAt) > now) ?? null;
}
