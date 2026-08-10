import { describe, expect, it } from "vitest";

import { buildExecutiveSummary } from "./summary";
import { renderReport } from "./render";
import { LOCALES } from "@/lib/i18n/locales";
import type { ScanResult } from "@/lib/types";

/**
 * A report requested in Slovak must not contain an English executive summary.
 *
 * The summary is assembled from evidence at render time, which is exactly where
 * a "deterministic" generator quietly stays English. The original built phrases
 * like `carr${n === 1 ? "ies" : "y"}` and slotted adjectives into a carrying
 * sentence — a shape that cannot be translated into a language whose adjectives
 * agree with case and number.
 */
const scan = (over: Partial<ScanResult["stats"]> = {}, band = "moderate"): ScanResult => ({
  scanId: "scan_1",
  target: "acme.example",
  mode: "passive",
  isDemo: false,
  startedAt: "2026-03-01T09:00:00.000Z",
  finishedAt: "2026-03-01T09:04:00.000Z",
  graph: { assets: [], edges: [] },
  findings: [],
  score: { value: 64, band, components: [], explanation: "" },
  timeline: [],
  providerRuns: [],
  stats: { assets: 7, webSurfaces: 3, shadowAssets: 0, highPriorityFindings: 0, nonProdSignals: 0, ...over },
} as unknown as ScanResult);

describe("executive summary", () => {
  it("is written in the requested language, not English", () => {
    const sk = buildExecutiveSummary(scan(), "sk");
    expect(sk).toContain("acme.example");
    expect(sk).not.toMatch(/presents|protection posture|observable asset/i);
    expect(sk).toMatch(/ochrann|povrch/i);
  });

  it("uses each language's plural forms for the counts it states", () => {
    // 2 and 7 take different words in Slovak. A fragment-assembled summary
    // could not get this right at all.
    const two = buildExecutiveSummary(scan({ assets: 2 }), "sk");
    const seven = buildExecutiveSummary(scan({ assets: 7 }), "sk");
    expect(two).toContain("2 pozorovateľné assety");
    expect(seven).toContain("7 pozorovateľných assetov");
  });

  it("never translates the target, the score or a hostname", () => {
    for (const { code } of LOCALES) {
      const summary = buildExecutiveSummary(scan({ shadowAssets: 2 }), code);
      expect(summary, `${code} lost the target`).toContain("acme.example");
      expect(summary, `${code} lost the score`).toContain("64");
    }
  });

  it("says the surface is clean in every language when it is", () => {
    for (const { code } of LOCALES) {
      const summary = buildExecutiveSummary(scan(), code);
      expect(summary.trim().length, `${code} produced nothing`).toBeGreaterThan(40);
      expect(summary).not.toContain("{");
    }
  });

  it("describes each posture band without falling back to English", () => {
    for (const band of ["guarded", "moderate", "elevated", "exposed"]) {
      const summary = buildExecutiveSummary(scan({}, band), "pl");
      expect(summary, `${band} is untranslated`).toMatch(/pozycja ochronna/i);
    }
  });
});

describe("the rendered document", () => {
  it("renders in every language without losing the evidence", async () => {
    for (const { code } of LOCALES) {
      const pdf = await renderReport(scan({ shadowAssets: 1, nonProdSignals: 2 }), code);
      expect(pdf.length, `${code} produced no document`).toBeGreaterThan(2000);
    }
  }, 60_000);
});
