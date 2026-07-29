/**
 * Weekly digest content model.
 *
 * Everything here is pure and deterministic: the same snapshot, events and
 * recommendations always produce byte-identical digest content. No AI is used to
 * choose the status, the counts, the severities or the actions — a customer
 * acting on a weekly email must be able to trust that the numbers came from the
 * observations, not from a generated sentence.
 *
 * It exists because the digest previously rendered a flat list that mixed change
 * events with recommendations, deduplicated nothing, showed a roll-up next to the
 * individual items it rolled up, and could claim exposure was "stable" in the
 * same email that reported new assets.
 */

import type { Priority } from "@/lib/types";
import type { GuardianDrift, GuardianEvent, GuardianRecommendation } from "./types";

/** User-facing areas, in the order they are rendered. */
export const DIGEST_AREAS = ["Email security", "Web security", "Certificates", "Identity", "Infrastructure", "Privacy"] as const;
export type DigestArea = (typeof DIGEST_AREAS)[number];

/** How many recommendation cards an email may show before summarising the rest. */
export const MAX_DIGEST_CARDS = 5;

/** The roll-up recommendation that summarises individually-reported assets. */
const ROLLUP_CODE = "surface-growth";
/** Recommendation code prefixes produced per asset — the roll-up's children. */
const ROLLUP_CHILD_PREFIXES = ["ownership:", "nonprod:", "auth:", "api:", "flapping:"];

const CHECKLIST_AREA: Record<string, DigestArea> = {
  spf: "Email security",
  dkim: "Email security",
  dmarc: "Email security",
  mta_sts: "Email security",
  email_security: "Email security",
  hsts: "Web security",
  https: "Web security",
  security_txt: "Web security",
  tls: "Certificates",
  dnssec: "Infrastructure",
};

/** The area a recommendation belongs to, derived from its deterministic code. */
export function areaForCode(code: string): DigestArea {
  if (code.startsWith("checklist:")) return CHECKLIST_AREA[code.slice("checklist:".length)] ?? "Infrastructure";
  if (code.startsWith("auth:")) return "Identity";
  return "Infrastructure";
}

/** The category portion of a recommendation code, without its asset list. */
export function categoryOf(code: string): string {
  const separator = code.indexOf(":");
  return separator === -1 ? code : code.slice(0, separator + 1) + (code.startsWith("checklist:") ? code.slice(separator + 1) : "");
}

/** Collapse an action to a comparable form so wording variance cannot create duplicates. */
function normalizeAction(action: string): string {
  return action.toLowerCase().replace(/[\s ]+/g, " ").replace(/[.,;:!?]+$/g, "").trim();
}

/**
 * A stable semantic identity for a recommendation:
 * organization + target + category + affected asset + normalized action.
 * Deliberately NOT the visible title — two different findings can share a title,
 * and the same finding can be phrased differently between scans.
 */
export function semanticKey(rec: GuardianRecommendation): string {
  const assets = [...rec.affectedAssets].map((asset) => asset.toLowerCase()).sort().join(",");
  return [rec.orgId, rec.target, categoryOf(rec.code), assets, normalizeAction(rec.suggestedReview)].join("|");
}

/**
 * Remove duplicates, preferring the recommendation id and falling back to the
 * semantic key. The first occurrence wins so ordering stays deterministic.
 */
export function dedupeRecommendations(recommendations: GuardianRecommendation[]): GuardianRecommendation[] {
  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();
  const out: GuardianRecommendation[] = [];
  for (const rec of recommendations) {
    const key = semanticKey(rec);
    if (rec.id && seenIds.has(rec.id)) continue;
    if (seenKeys.has(key)) continue;
    if (rec.id) seenIds.add(rec.id);
    seenKeys.add(key);
    out.push(rec);
  }
  return out;
}

/**
 * Drop a parent roll-up when the individual recommendations it summarises are
 * already in the same digest — showing both makes the email read as if the same
 * work is listed twice.
 */
export function withoutSupersededRollups(recommendations: GuardianRecommendation[]): GuardianRecommendation[] {
  const hasChildren = recommendations.some((rec) => ROLLUP_CHILD_PREFIXES.some((prefix) => rec.code.startsWith(prefix)));
  if (!hasChildren) return recommendations;
  return recommendations.filter((rec) => rec.code !== ROLLUP_CODE);
}

export type RecommendationState = "new" | "existing" | "regressed";

/** Whether the customer is seeing this recommendation for the first time this week. */
export function stateOf(rec: GuardianRecommendation, windowStartMs: number): RecommendationState {
  const regressed = rec.regressedAt ? Date.parse(rec.regressedAt) : NaN;
  if (Number.isFinite(regressed) && regressed >= windowStartMs) return "regressed";
  const first = Date.parse(rec.firstObservedAt);
  return Number.isFinite(first) && first >= windowStartMs ? "new" : "existing";
}

export interface DigestRecommendationCard {
  id: string;
  code: string;
  title: string;
  priority: Priority;
  area: DigestArea;
  /** The asset the customer should look at; the rest are counted in assetCount. */
  affectedAsset: string;
  assetCount: number;
  state: RecommendationState;
  action: string;
  /** Tenant-scoped deep link into the OUTSIDE detail page. */
  link: string;
}

const PRIORITY_RANK: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

/** A tenant-scoped deep link. Both the organization and the target are encoded. */
export function recommendationLink(baseUrl: string, rec: GuardianRecommendation): string {
  const url = new URL("/guardian", baseUrl);
  url.searchParams.set("orgId", rec.orgId);
  url.searchParams.set("target", rec.target);
  url.hash = `rec-${rec.code}`;
  return url.toString();
}

export interface DigestCards {
  /** At most MAX_DIGEST_CARDS cards, highest priority first, grouped for render. */
  cards: DigestRecommendationCard[];
  /** Recommendations that did not fit, summarised as a single line. */
  additional: number;
  /** Total after deduplication and roll-up suppression. */
  total: number;
}

/**
 * Build the renderable cards: deduplicated, roll-up-suppressed, sorted by
 * priority then title for stable ordering, and capped.
 */
export function buildDigestCards(
  recommendations: GuardianRecommendation[],
  baseUrl: string,
  windowStartMs: number,
  limit = MAX_DIGEST_CARDS,
): DigestCards {
  const open = recommendations.filter((rec) => rec.status !== "resolved" && rec.status !== "dismissed");
  const cleaned = withoutSupersededRollups(dedupeRecommendations(open));
  const sorted = [...cleaned].sort(
    (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.title.localeCompare(b.title) || a.code.localeCompare(b.code),
  );
  const cards = sorted.slice(0, limit).map<DigestRecommendationCard>((rec) => ({
    id: rec.id,
    code: rec.code,
    title: rec.title,
    priority: rec.priority,
    area: areaForCode(rec.code),
    affectedAsset: rec.affectedAssets[0] ?? rec.target,
    assetCount: rec.affectedAssets.length,
    state: stateOf(rec, windowStartMs),
    action: rec.suggestedReview,
    link: recommendationLink(baseUrl, rec),
  }));
  return { cards, additional: Math.max(0, sorted.length - cards.length), total: sorted.length };
}

/** Cards grouped by user-facing area, in DIGEST_AREAS order, empty areas omitted. */
export function groupCardsByArea(cards: DigestRecommendationCard[]): Array<{ area: DigestArea; cards: DigestRecommendationCard[] }> {
  return DIGEST_AREAS.map((area) => ({ area, cards: cards.filter((card) => card.area === area) })).filter((group) => group.cards.length > 0);
}

/**
 * What changed on the outside this week. New and returning assets are counted
 * separately — a returning asset is not a new one, and reporting them together
 * as "new" overstates growth.
 */
export interface DigestChangeStatus {
  newAssets: number;
  returnedAssets: number;
  removedAssets: number;
  /** New authentication, API, non-production or shadow surface signals. */
  newSurfaceSignals: number;
  checklistImprovements: number;
  checklistRegressions: number;
  /** Every observed change that materially altered the external surface. */
  materialChanges: number;
  /** Changes at high or critical severity — what a reader should act on first. */
  highPriorityAlerts: number;
  headline: string;
}

const SURFACE_SIGNAL_TYPES = ["auth_surface_new", "api_surface_new", "nonproduction_reachable", "shadow_appeared"];

export function buildChangeStatus(events: GuardianEvent[], drift: GuardianDrift): DigestChangeStatus {
  const count = (predicate: (event: GuardianEvent) => boolean) => events.filter(predicate).length;

  const newAssets = count((event) => event.type === "asset_new");
  const returnedAssets = count((event) => event.type === "asset_returned");
  const removedAssets = count((event) => event.type === "asset_removed");
  const newSurfaceSignals = count((event) => SURFACE_SIGNAL_TYPES.includes(event.type));
  const checklist = events.filter((event) => event.type === "checklist_changed");
  const checklistImprovements = checklist.filter((event) => event.severity === "info").length;
  const checklistRegressions = checklist.length - checklistImprovements;
  const highPriorityAlerts = count((event) => event.severity === "critical" || event.severity === "high");

  const materialChanges = newAssets + returnedAssets + removedAssets + newSurfaceSignals + checklist.length;

  // A digest that reports changes must never also claim the surface was stable.
  const headline =
    highPriorityAlerts > 0
      ? `${highPriorityAlerts} high-priority alert${highPriorityAlerts === 1 ? "" : "s"} to review`
      : drift.direction === "worsening"
        ? drift.headline
        : materialChanges > 0
          ? "External exposure changed, with no material deterioration."
          : drift.headline;

  return {
    newAssets,
    returnedAssets,
    removedAssets,
    newSurfaceSignals,
    checklistImprovements,
    checklistRegressions,
    materialChanges,
    highPriorityAlerts,
    headline,
  };
}

/**
 * A factual one-line summary of the change status. Counts are reported
 * separately; "new or returning" is only used when the two cannot be told apart.
 */
export function changeSummarySentence(status: DigestChangeStatus): string {
  const parts = [
    `${status.newAssets} new asset${status.newAssets === 1 ? "" : "s"}`,
    `${status.returnedAssets} returning asset${status.returnedAssets === 1 ? "" : "s"}`,
    `${status.removedAssets} disappearance${status.removedAssets === 1 ? "" : "s"}`,
    `${status.newSurfaceSignals} new surface signal${status.newSurfaceSignals === 1 ? "" : "s"}`,
    `${status.checklistImprovements + status.checklistRegressions} security-checklist change${status.checklistImprovements + status.checklistRegressions === 1 ? "" : "s"}`,
  ];
  return `Guardian observed ${parts.join(", ")}.`;
}
