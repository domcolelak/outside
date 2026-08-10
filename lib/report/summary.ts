/**
 * Deterministic executive summary. Generated purely from scan evidence — no AI,
 * no fabrication.
 *
 * Every sentence is translated whole rather than assembled from fragments. The
 * English original built phrases like `carr${n === 1 ? "ies" : "y"}` and slotted
 * adjectives into a carrying sentence, which only works because English nouns
 * and adjectives do not agree. In Slovak, Czech and Polish the adjective has to
 * change with the noun's case and number, so a fragment that reads correctly in
 * one sentence is wrong in the next. Whole sentences, one per situation, are the
 * only structure a translator can actually get right.
 */

import type { ScanResult } from "@/lib/types";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import { getTranslator, type MessageKey } from "@/lib/i18n/messages";

/** Which "how big is this surface" sentence applies. */
function complexityKey(assetCount: number): MessageKey<"report"> {
  if (assetCount <= 4) return "summaryComplexitySmall";
  if (assetCount <= 12) return "summaryComplexityModerate";
  if (assetCount <= 40) return "summaryComplexitySizeable";
  return "summaryComplexityLarge";
}

const POSTURE_KEYS: Record<string, MessageKey<"report">> = {
  guarded: "summaryPostureGuarded",
  moderate: "summaryPostureModerate",
  elevated: "summaryPostureElevated",
  exposed: "summaryPostureExposed",
};

export function buildExecutiveSummary(result: ScanResult, locale: Locale = DEFAULT_LOCALE): string {
  const t = getTranslator(locale);
  const { stats } = result;
  const parts: string[] = [];

  parts.push(
    t.t("report", "summaryFootprint", {
      target: result.target,
      assets: t.t("report", "summaryAssetCount", { count: stats.assets }),
      surfaces: t.t("report", "summarySurfaceCount", { count: stats.webSurfaces }),
    }),
    t.t("report", complexityKey(stats.assets)),
    t.t("report", POSTURE_KEYS[result.score.band] ?? "summaryPostureModerate", { score: result.score.value }),
  );

  if (stats.shadowAssets > 0) parts.push(t.t("report", "summaryShadow", { count: stats.shadowAssets }));
  if (stats.nonProdSignals > 0) parts.push(t.t("report", "summaryNonProd", { count: stats.nonProdSignals }));

  const appeared = result.changeSummary?.events.find((e) => e.type === "asset_appeared" || e.type === "asset_returned");
  if (appeared) {
    // The label is a hostname: evidence, never translated.
    parts.push(t.t("report", appeared.type === "asset_returned" ? "summaryChangeReturned" : "summaryChangeNew", { label: appeared.label }));
  }

  if (stats.shadowAssets === 0 && stats.nonProdSignals === 0 && stats.highPriorityFindings === 0) {
    parts.push(t.t("report", "summaryClean"));
  }

  return parts.join(" ");
}
