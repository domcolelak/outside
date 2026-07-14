/**
 * Aegis investigation — ported from the real Aegis AI incident investigator
 * (github.com/domcolelak/aegis-ai) and rebuilt natively on OUTSIDE's evidence.
 *
 * Aegis AI's principle is OUTSIDE's principle: *deterministic reduces the problem
 * space; AI interprets what remains*. There, weighted correlation strategies turn
 * log events into a causal graph, roots are ranked by blast-radius × earliness ×
 * impact, and a Devil's Advocate attacks the leading hypothesis so the verdict
 * must carry surviving contradicting evidence. Here we do the same over *findings*:
 *
 *   findings ─▶ weighted correlation (auditable per-strategy) ─▶ incidents
 *            ─▶ rank (blast-radius × severity × recency) ─▶ assessment
 *            ─▶ leading hypothesis + supporting + CONTRADICTING evidence
 *
 * Nothing is fabricated: correlation scores and the counter-evidence are derived
 * from the same observed facts the findings already cite.
 */

import type { Asset, Finding, Priority, ScanResult } from "@/lib/types";
import { PRIORITY_RANK } from "@/lib/analysis/priority";

/* ---- Correlation strategies (each scores a relatedness signal in [0,1]) ---- */

interface StratCtx {
  assetById: Map<string, Asset>;
  adjacency: Map<string, Set<string>>; // assetId -> connected assetIds (graph edges)
  registrableParent: (canonical: string) => string;
}

interface Strategy {
  name: string;
  weight: number;
  score(a: Finding, b: Finding, ctx: StratCtx): number;
}

/** Known exposure cascades between finding categories (direction-agnostic here). */
const CASCADES: Record<string, number> = {
  "surface-change|auth-surface": 0.8,
  "surface-change|non-production-exposure": 0.7,
  "shadow-asset|auth-surface": 0.9,
  "shadow-asset|non-production-exposure": 0.7,
  "non-production-exposure|auth-surface": 0.8,
  "surface-change|security_headers": 0.6,
  "mail-security|auth-surface": 0.5,
};

function cascade(a: string, b: string): number {
  return CASCADES[`${a}|${b}`] ?? CASCADES[`${b}|${a}`] ?? 0;
}

const STRATEGIES: Strategy[] = [
  {
    // Same asset is the strongest structural link two findings can have.
    name: "same_asset",
    weight: 0.3,
    score: (a, b) => (a.assetId && a.assetId === b.assetId ? 1 : 0),
  },
  {
    // Assets joined by a graph edge (shared subdomain / infrastructure).
    name: "graph_adjacency",
    weight: 0.25,
    score: (a, b, ctx) => (ctx.adjacency.get(a.assetId)?.has(b.assetId) ? 0.8 : 0),
  },
  {
    // Hostnames under the same registrable parent move together operationally.
    name: "shared_parent",
    weight: 0.2,
    score: (a, b, ctx) => {
      const ca = ctx.assetById.get(a.assetId)?.canonical;
      const cb = ctx.assetById.get(b.assetId)?.canonical;
      if (!ca || !cb || ca === cb) return 0;
      return ctx.registrableParent(ca) === ctx.registrableParent(cb) ? 0.5 : 0;
    },
  },
  {
    // Recurring exposure cascades between finding categories.
    name: "exposure_cascade",
    weight: 0.15,
    score: (a, b) => cascade(a.category, b.category),
  },
  {
    // Both assets changed in the current scan window (moved together).
    name: "temporal_change",
    weight: 0.1,
    score: (a, b, ctx) => {
      const na = ctx.assetById.get(a.assetId)?.attrs.newlyObserved === true;
      const nb = ctx.assetById.get(b.assetId)?.attrs.newlyObserved === true;
      return na && nb ? 0.7 : 0;
    },
  },
];

const TOTAL_WEIGHT = STRATEGIES.reduce((s, x) => s + x.weight, 0);

export interface CorrelationEdge {
  from: string; // finding id
  to: string;
  score: number; // composite [0,1]
  breakdown: Record<string, number>; // per-strategy score (auditable)
}

export interface ExposureIncident {
  id: string;
  title: string;
  priority: Priority;
  rank: number; // 0..1 composite ranking
  blastRadius: number; // distinct assets involved
  assetIds: string[];
  findingIds: string[];
  chain: string[]; // ordered narrative of how the signals connect
  edges: CorrelationEdge[];
  summary: string;
}

export interface ExposureAssessment {
  incidentId: string;
  hypothesis: string;
  confidence: number;
  supportingEvidence: string[];
  /** The Devil's Advocate: honest reasons the hypothesis might be wrong or overstated. */
  contradictingEvidence: string[];
  strongestCounterargument: string;
  recommendedActions: string[];
  source: "deterministic" | "ai";
}

export interface Investigation {
  incidents: ExposureIncident[];
  assessment: ExposureAssessment | null;
}

function registrableParentOf(canonical: string): string {
  const parts = canonical.split(".");
  return parts.length <= 2 ? canonical : parts.slice(-2).join(".");
}

/** Correlate findings and group them into ranked incidents. */
export function buildInvestigation(result: ScanResult): Investigation {
  const findings = result.findings;
  const ctx: StratCtx = {
    assetById: new Map(result.graph.assets.map((a) => [a.id, a])),
    adjacency: new Map(),
    registrableParent: registrableParentOf,
  };
  for (const e of result.graph.edges) {
    (ctx.adjacency.get(e.from) ?? ctx.adjacency.set(e.from, new Set()).get(e.from)!).add(e.to);
    (ctx.adjacency.get(e.to) ?? ctx.adjacency.set(e.to, new Set()).get(e.to)!).add(e.from);
  }

  // Pairwise correlation → edges above threshold.
  const THRESHOLD = 0.34;
  const edges: CorrelationEdge[] = [];
  for (let i = 0; i < findings.length; i++) {
    for (let j = i + 1; j < findings.length; j++) {
      const a = findings[i]!;
      const b = findings[j]!;
      const breakdown: Record<string, number> = {};
      let weighted = 0;
      for (const s of STRATEGIES) {
        const v = s.score(a, b, ctx);
        if (v > 0) breakdown[s.name] = Math.round(v * 100) / 100;
        weighted += v * s.weight;
      }
      const composite = Math.round((weighted / TOTAL_WEIGHT) * 100) / 100;
      if (composite >= THRESHOLD) edges.push({ from: a.id, to: b.id, score: composite, breakdown });
    }
  }

  // Connected components over the correlation edges = incident groups.
  const adj = new Map<string, Set<string>>();
  for (const f of findings) adj.set(f.id, new Set());
  for (const e of edges) {
    adj.get(e.from)!.add(e.to);
    adj.get(e.to)!.add(e.from);
  }
  const findingById = new Map(findings.map((f) => [f.id, f]));
  const seen = new Set<string>();
  const incidents: ExposureIncident[] = [];
  const totalAssets = Math.max(result.graph.assets.length, 1);

  for (const f of findings) {
    if (seen.has(f.id) || adj.get(f.id)!.size === 0) continue; // only multi-finding groups are "incidents"
    const group: string[] = [];
    const stack = [f.id];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      group.push(id);
      for (const n of adj.get(id) ?? []) if (!seen.has(n)) stack.push(n);
    }
    if (group.length < 2) continue;

    const groupFindings = group.map((id) => findingById.get(id)!).sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]);
    const assetIds = [...new Set(groupFindings.map((g) => g.assetId).filter(Boolean))];
    const priority = groupFindings[0]!.priority;
    const recency = groupFindings.some((g) => ctx.assetById.get(g.assetId)?.attrs.newlyObserved === true) ? 1 : 0.3;
    const reach = assetIds.length / totalAssets;
    const severity = PRIORITY_RANK[priority] / 4;
    const rank = Math.round((0.45 * reach + 0.3 * recency + 0.25 * severity) * 1000) / 1000;

    const chain = groupFindings.map((g) => {
      const label = ctx.assetById.get(g.assetId)?.label ?? "asset";
      return `${label}: ${g.title.toLowerCase()}`;
    });

    incidents.push({
      id: `inc_${group.sort()[0]}`,
      title: incidentTitle(groupFindings, ctx),
      priority,
      rank,
      blastRadius: assetIds.length,
      assetIds,
      findingIds: group,
      chain,
      edges: edges.filter((e) => group.includes(e.from) && group.includes(e.to)),
      summary: `${groupFindings.length} correlated signals across ${assetIds.length} asset${assetIds.length > 1 ? "s" : ""} form a single exposure.`,
    });
  }

  incidents.sort((a, b) => b.rank - a.rank);
  const assessment = incidents.length ? assessTopIncident(incidents[0]!, result, ctx) : null;
  return { incidents, assessment };
}

function incidentTitle(findings: Finding[], ctx: StratCtx): string {
  const lead = findings[0]!;
  const asset = ctx.assetById.get(lead.assetId)?.label ?? "an asset";
  return `Correlated exposure around ${asset}`;
}

/**
 * Deterministic assessment with a built-in Devil's Advocate: the leading
 * hypothesis MUST be accompanied by honestly-derived contradicting evidence, so
 * the verdict can never overstate certainty. (AI enhancement is an optional seam
 * over this same structure.)
 */
function assessTopIncident(incident: ExposureIncident, result: ScanResult, ctx: StratCtx): ExposureAssessment {
  const findings = incident.findingIds.map((id) => result.findings.find((f) => f.id === id)!).filter(Boolean);
  const assets = incident.assetIds.map((id) => ctx.assetById.get(id)).filter((a): a is Asset => !!a);

  const supporting = findings.slice(0, 4).map((f) => `${ctx.assetById.get(f.assetId)?.label ?? "asset"}: ${f.observation}`);

  // Devil's Advocate — reasons the leading hypothesis might be wrong/overstated,
  // each grounded in an observed fact.
  const contradicting: string[] = [];
  if (assets.some((a) => a.attrs.cdn && a.attrs.cdn !== "none")) {
    contradicting.push("Part of this surface is fronted by a CDN/WAF, which mitigates some of the exposure the individual signals imply.");
  }
  const lowConf = assets.find((a) => a.orgConfidence < 0.9);
  if (lowConf) {
    contradicting.push(`Organization attribution for ${lowConf.label} is not certain (${Math.round(lowConf.orgConfidence * 100)}% confidence), so it may not belong to this org.`);
  }
  if (findings.some((f) => f.confidence < 0.8 || f.inference)) {
    contradicting.push("Several signals rest on naming/heuristics (inference), not confirmed configuration — a plausible-but-benign explanation cannot be ruled out from the outside.");
  }
  contradicting.push("This is external observation only — it indicates exposure to review, not confirmed misconfiguration or compromise.");

  const confidence = Math.min(0.9, Math.max(0.4, findings.reduce((s, f) => s + f.confidence, 0) / Math.max(findings.length, 1) - contradicting.length * 0.05));

  const actions = [...new Set(findings.map((f) => f.recommendation))].slice(0, 4);

  return {
    incidentId: incident.id,
    hypothesis: `The ${findings.length} correlated signals across ${incident.assetIds.length} asset(s) most plausibly describe a single reviewable exposure led by "${findings[0]!.title}".`,
    confidence: Math.round(confidence * 100) / 100,
    supportingEvidence: supporting,
    contradictingEvidence: contradicting,
    strongestCounterargument: contradicting[0]!,
    recommendedActions: actions,
    source: "deterministic",
  };
}
