import { describe, expect, it } from "vitest";

import { findingText } from "./finding-text";
import { generateFindings } from "@/lib/analysis/findings";
import { LOCALES } from "@/lib/i18n/locales";
import type { Asset, Finding } from "@/lib/types";

/**
 * Finding wording, in the reader's language, without losing the evidence.
 *
 * Findings are the product's actual content — the sentences a customer reads and
 * acts on. They are also generated from evidence and persisted, so they cannot
 * be translated where they are written: the record has to keep what it said at
 * the time. The generator stores the English and a key; this is where the key
 * becomes words, and where a finding without one keeps its English.
 */
const asset = (over: Partial<Asset> = {}): Asset => ({
  id: "asset_1",
  kind: "web_service",
  label: "staging.acme.example",
  canonical: "staging.acme.example",
  firstObservedAt: "2026-03-01T00:00:00.000Z",
  lastObservedAt: "2026-03-01T00:00:00.000Z",
  discoveredVia: ["dns"],
  evidence: [],
  signals: [{ code: "env.nonprod", label: "Non-production naming", confidence: 0.8, rationale: "Hostname begins with staging." }],
  priority: "high",
  orgConfidence: 1,
  attrs: { technologies: [] },
  ...over,
} as unknown as Asset);

const findingFor = (a: Asset): Finding => generateFindings([a], [], "2026-03-01T00:00:00.000Z")[0]!;

describe("finding wording", () => {
  it("carries a key so it can be read in another language later", () => {
    const finding = findingFor(asset());
    expect(finding.textKey).toBe("nonProdExposure");
    expect(finding.textValues).toEqual({ label: "staging.acme.example" });
  });

  it("reads in the requested language", () => {
    const finding = findingFor(asset());
    const sk = findingText(finding, "sk");
    expect(sk.title).toBe("Možné neprodukčné prostredie je verejne dostupné");
    expect(sk.title).not.toBe(finding.title);
    expect(sk.recommendation).toMatch(/Overte/);
  });

  it("never translates the hostname inside the sentence", () => {
    // The observation names the asset. That is evidence: it has to match what
    // the customer sees in DNS, in their console, and in the graph.
    for (const { code } of LOCALES) {
      const text = findingText(findingFor(asset()), code);
      expect(text.observation, `${code} lost the hostname`).toContain("staging.acme.example");
    }
  });

  it("resolves all four sentences in every language", () => {
    for (const { code } of LOCALES) {
      const text = findingText(findingFor(asset()), code);
      for (const [field, value] of Object.entries(text)) {
        expect(value.trim().length, `${code} ${field} is empty`).toBeGreaterThan(5);
        expect(value, `${code} ${field} shows a raw key`).not.toMatch(/^[a-z]+[A-Z]\w+$/);
        expect(value, `${code} ${field} has an unfilled placeholder`).not.toContain("{");
      }
    }
  });

  it("keeps its own English when it has no key", () => {
    // Two real cases: rows written before localization, and generators not yet
    // keyed. Both must render their sentence, never a bare key.
    const legacy = { ...findingFor(asset()), textKey: undefined, textValues: undefined } as Finding;
    const text = findingText(legacy, "sk");
    expect(text.title).toBe(legacy.title);
    expect(text.observation).toBe(legacy.observation);
  });

  it("gives every keyed finding a translation in every language", () => {
    // Catches the case this whole layer exists to prevent: a generator that
    // starts emitting a key nobody has written messages for.
    const cases: Array<[string, Asset]> = [
      ["shadowAsset", asset({ signals: [{ code: "asset.shadow", label: "Legacy naming", confidence: 0.7, rationale: "r" }] } as Partial<Asset>)],
      ["nonProdExposure", asset()],
      ["authSurface", asset({ signals: [{ code: "surface.auth", label: "Login naming", confidence: 0.7, rationale: "r" }] } as Partial<Asset>)],
      ["newAsset", asset({ signals: [], attrs: { technologies: [], newlyObserved: true } } as Partial<Asset>)],
    ];
    for (const [expectedKey, subject] of cases) {
      const finding = findingFor(subject);
      expect(finding.textKey, `${expectedKey} was not emitted`).toBe(expectedKey);
      for (const { code } of LOCALES) {
        const text = findingText(finding, code);
        if (code === "en") continue;
        expect(text.title, `${expectedKey} is untranslated in ${code}`).not.toBe(finding.title);
      }
    }
  });
});
