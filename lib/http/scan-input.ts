import type { Asset, Finding, Priority, ScanResult, ScoreComponent } from "@/lib/types";
import { normalizeDomain } from "@/lib/security/target";

const PRIORITIES = new Set<Priority>(["info", "low", "medium", "high", "critical"]);
const BANDS = new Set(["guarded", "moderate", "elevated", "exposed"]);

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= max ? value : null;
}
function number(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;
}
function priority(value: unknown): Priority | null {
  return typeof value === "string" && PRIORITIES.has(value as Priority) ? value as Priority : null;
}

function sanitizeAsset(raw: unknown): Asset | null {
  const value = record(raw);
  if (!value) return null;
  const id = text(value.id, 160), label = text(value.label, 253), kind = text(value.kind, 40), p = priority(value.priority);
  if (!id || !label || !kind || !p) return null;
  return {
    id, label, canonical: text(value.canonical, 253) ?? label.toLowerCase(), kind: kind as Asset["kind"], priority: p,
    firstObservedAt: text(value.firstObservedAt, 40) ?? new Date(0).toISOString(),
    lastObservedAt: text(value.lastObservedAt, 40) ?? new Date(0).toISOString(),
    discoveredVia: [], evidence: [], signals: [], orgConfidence: number(value.orgConfidence, 0, 1) ?? 0, attrs: {},
  };
}

export function sanitizeFinding(raw: unknown): Finding | null {
  const value = record(raw);
  if (!value) return null;
  const required = {
    id: text(value.id, 160), title: text(value.title, 300), assetId: text(value.assetId, 160),
    category: text(value.category, 80), observation: text(value.observation, 2_000), concern: text(value.concern, 2_000),
    reasoning: text(value.reasoning, 2_000), recommendation: text(value.recommendation, 2_000), p: priority(value.priority),
    confidence: number(value.confidence, 0, 1),
  };
  if (Object.values(required).some((item) => item === null)) return null;
  return {
    id: required.id!, title: required.title!, assetId: required.assetId!, category: required.category!,
    observation: required.observation!, concern: required.concern!, reasoning: required.reasoning!, recommendation: required.recommendation!,
    priority: required.p!, confidence: required.confidence!, inference: text(value.inference, 2_000) ?? undefined,
    evidence: [], discoveryMethod: "seed", createdAt: text(value.createdAt, 40) ?? new Date(0).toISOString(),
  };
}

export function sanitizeScanResult(raw: unknown): ScanResult | null {
  const value = record(raw), graph = record(value?.graph), score = record(value?.score), stats = record(value?.stats);
  if (!value || !graph || !score || !stats) return null;
  const scanId = text(value.scanId, 160), rawTarget = text(value.target, 253), finishedAt = text(value.finishedAt, 40);
  let target: string;
  try { target = normalizeDomain(rawTarget ?? ""); } catch {
    if (value.isDemo === true && rawTarget && /^[a-z0-9.-]{1,253}\.example$/i.test(rawTarget)) target = rawTarget.toLowerCase();
    else return null;
  }
  const scoreValue = number(score.value, 0, 100), band = text(score.band, 20);
  if (!scanId || !finishedAt || scoreValue === null || !band || !BANDS.has(band)) return null;
  const assetsRaw = Array.isArray(graph.assets) ? graph.assets : [];
  const findingsRaw = Array.isArray(value.findings) ? value.findings : [];
  const componentsRaw = Array.isArray(score.components) ? score.components : [];
  if (assetsRaw.length > 500 || findingsRaw.length > 200 || componentsRaw.length > 100) return null;
  const assets = assetsRaw.map(sanitizeAsset);
  const findings = findingsRaw.map(sanitizeFinding);
  if (assets.some((item) => !item) || findings.some((item) => !item)) return null;
  const components: ScoreComponent[] = [];
  for (const item of componentsRaw) {
    const component = record(item); if (!component) return null;
    const code = text(component.code, 80), label = text(component.label, 200), detail = text(component.detail, 1_000), impact = number(component.impact, -100, 100);
    if (!code || !label || !detail || impact === null) return null;
    components.push({ code, label, detail, impact });
  }
  const stat = (name: string) => number(stats[name], 0, 100_000);
  const statValues = [stat("assets"), stat("webSurfaces"), stat("shadowAssets"), stat("highPriorityFindings"), stat("nonProdSignals")];
  if (statValues.some((item) => item === null)) return null;
  return {
    scanId, target, mode: value.mode === "demo" ? "demo" : "passive", isDemo: value.isDemo === true,
    startedAt: text(value.startedAt, 40) ?? finishedAt, finishedAt,
    graph: { assets: assets as Asset[], edges: [] }, findings: findings as Finding[],
    score: { value: scoreValue, band: band as ScanResult["score"]["band"], components, explanation: text(score.explanation, 2_000) ?? "" },
    stats: { assets: statValues[0]!, webSurfaces: statValues[1]!, shadowAssets: statValues[2]!, highPriorityFindings: statValues[3]!, nonProdSignals: statValues[4]! },
    timeline: [], providerRuns: [],
  };
}
