/**
 * Deterministic executive summary. Generated purely from scan evidence — no AI,
 * no fabrication. The optional AI layer (roadmap) may later rephrase this text,
 * but the facts it states always come from the ScanResult.
 */

import type { ScanResult } from "@/lib/types";

const BAND_PHRASE: Record<string, string> = {
  guarded: "a well-contained",
  moderate: "a moderately complex",
  elevated: "an elevated",
  exposed: "a broad and exposed",
};

function complexityPhrase(assetCount: number): string {
  if (assetCount <= 4) return "a small";
  if (assetCount <= 12) return "a moderately complex";
  if (assetCount <= 40) return "a sizeable";
  return "a large";
}

export function buildExecutiveSummary(result: ScanResult): string {
  const { stats } = result;
  const org = result.target;
  const parts: string[] = [];

  parts.push(
    `${org} presents ${complexityPhrase(stats.assets)} public digital footprint of ${stats.assets} observable ` +
      `asset${stats.assets === 1 ? "" : "s"}, including ${stats.webSurfaces} public web/API surface${stats.webSurfaces === 1 ? "" : "s"}. ` +
      `Its protection posture is ${BAND_PHRASE[result.score.band] ?? "a"} surface, scoring ${result.score.value}/100.`,
  );

  if (stats.shadowAssets > 0) {
    parts.push(
      `${stats.shadowAssets} asset${stats.shadowAssets === 1 ? "" : "s"} show${stats.shadowAssets === 1 ? "s" : ""} signals ` +
        `consistent with legacy or unmanaged infrastructure and should be reviewed for current ownership and business purpose.`,
    );
  }
  if (stats.nonProdSignals > 0) {
    parts.push(
      `${stats.nonProdSignals} publicly reachable hostname${stats.nonProdSignals === 1 ? "" : "s"} carr${stats.nonProdSignals === 1 ? "ies" : "y"} ` +
        `non-production naming indicators that warrant confirmation of intended exposure.`,
    );
  }

  const appeared = result.changeSummary?.events.find((e) => e.type === "asset_appeared" || e.type === "asset_returned");
  if (appeared) {
    parts.push(`The most significant recent change is ${appeared.label}, ${appeared.type === "asset_returned" ? "which returned to the public surface" : "newly observed"}.`);
  }

  if (stats.shadowAssets === 0 && stats.nonProdSignals === 0 && stats.highPriorityFindings === 0) {
    parts.push("No shadow assets, non-production exposure, or high-priority findings were observed on the current external surface.");
  }

  return parts.join(" ");
}
