import type { DriftDirection, GuardianDrift, GuardianDriftDimension, GuardianMetrics, GuardianSnapshot } from "./types";

function dimension(code: keyof GuardianMetrics | "exposureScore", label: string, current: number, previous: number, risingBad = true): GuardianDriftDimension {
  const delta = Math.round((current - previous) * 10) / 10;
  const threshold = Math.max(1, Math.abs(previous) * 0.1);
  const direction: DriftDirection = Math.abs(delta) < threshold ? "stable" : delta > 0 ? (risingBad ? "worsening" : "improving") : (risingBad ? "improving" : "worsening");
  const movement = delta === 0 ? "did not materially change" : `${delta > 0 ? "increased" : "decreased"} by ${Math.abs(delta)}`;
  return { code, label, current, previous, delta, direction, explanation: `${label} ${movement} during the observed period.` };
}

function neutralDimension(code: keyof GuardianMetrics, label: string, current: number, previous: number): GuardianDriftDimension {
  const delta = Math.round((current - previous) * 10) / 10;
  const threshold = Math.max(1, Math.abs(previous) * 0.1);
  const direction: DriftDirection = Math.abs(delta) < threshold ? "stable" : "watch";
  const movement = delta === 0 ? "did not materially change" : `${delta > 0 ? "increased" : "decreased"} by ${Math.abs(delta)}`;
  return { code, label, current, previous, delta, direction, explanation: `${label} ${movement}; Guardian records this as a migration signal rather than assuming it is positive or negative.` };
}

function technologyComposition(previous: GuardianSnapshot, current: GuardianSnapshot): GuardianDriftDimension {
  const before = new Set(previous.inventory.flatMap((item) => item.technologies));
  const now = new Set(current.inventory.flatMap((item) => item.technologies));
  const added = [...now].filter((item) => !before.has(item));
  const removed = [...before].filter((item) => !now.has(item));
  const changed = added.length + removed.length;
  const detail = changed === 0 ? "Observed technology composition did not materially change." : `Technology composition changed: ${added.length ? `added ${added.slice(0, 3).join(", ")}` : "no additions"}; ${removed.length ? `no longer observed ${removed.slice(0, 3).join(", ")}` : "no removals"}. Guardian does not call this modernization without version evidence.`;
  return { code: "technology_composition", label: "Technology composition", current: now.size, previous: before.size, delta: changed, direction: changed ? "watch" : "stable", explanation: detail };
}

export function calculateDrift(history: GuardianSnapshot[], current: GuardianSnapshot): GuardianDrift {
  const candidates = history.filter((snapshot) => snapshot.scanId !== current.scanId && Date.parse(snapshot.observedAt) <= Date.parse(current.observedAt));
  const cutoff = Date.parse(current.observedAt) - 31 * 86_400_000;
  const baseline = candidates.find((snapshot) => Date.parse(snapshot.observedAt) >= cutoff) ?? candidates[0];
  if (!baseline) return { from: null, to: current.observedAt, direction: "stable", headline: "Guardian baseline established", narrative: "This scan establishes the first factual baseline. Drift becomes available after another observation.", dimensions: [] };
  const dimensions = [
    dimension("assets", "External assets", current.metrics.assets, baseline.metrics.assets),
    dimension("shadowAssets", "Possible shadow assets", current.metrics.shadowAssets, baseline.metrics.shadowAssets),
    dimension("authSurfaces", "Authentication surfaces", current.metrics.authSurfaces, baseline.metrics.authSurfaces),
    dimension("apiSurfaces", "API-related surfaces", current.metrics.apiSurfaces, baseline.metrics.apiSurfaces),
    dimension("nonProduction", "Non-production surfaces", current.metrics.nonProduction, baseline.metrics.nonProduction),
    dimension("technologies", "Technology diversity", current.metrics.technologies, baseline.metrics.technologies),
    technologyComposition(baseline, current),
    dimension("infrastructureProviders", "Infrastructure providers", current.metrics.infrastructureProviders, baseline.metrics.infrastructureProviders),
    neutralDimension("cloudAssets", "Cloud-hosted assets", current.metrics.cloudAssets, baseline.metrics.cloudAssets),
    neutralDimension("cdnFrontedAssets", "CDN-fronted assets", current.metrics.cdnFrontedAssets, baseline.metrics.cdnFrontedAssets),
    dimension("checklistPassed", "Passing checklist controls", current.metrics.checklistPassed, baseline.metrics.checklistPassed, false),
    dimension("exposureScore", "Protection posture", current.exposureScore, baseline.exposureScore, false),
  ];
  const worsening = dimensions.filter((item) => item.direction === "worsening").length;
  const improving = dimensions.filter((item) => item.direction === "improving").length;
  const moving = dimensions.filter((item) => item.direction !== "stable").length;
  const direction: DriftDirection = worsening >= improving + 2 ? "worsening" : improving >= worsening + 2 ? "improving" : moving > 0 ? "watch" : "stable";
  const headline = direction === "improving" ? "External exposure is becoming simpler" : direction === "worsening" ? "External exposure is expanding" : direction === "watch" ? "External exposure is shifting" : "External exposure is stable";
  const changed = dimensions.filter((item) => item.direction !== "stable").map((item) => item.explanation);
  return { from: baseline.observedAt, to: current.observedAt, direction, headline, narrative: changed.length ? changed.slice(0, 3).join(" ") : "No material movement was observed across Guardian's tracked dimensions.", dimensions };
}
