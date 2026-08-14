import { describe, expect, it } from "vitest";

import { findingText } from "./finding-text";
import { generateFindings } from "@/lib/analysis/findings";
import { generateMisconfigurationFindings } from "@/lib/analysis/misconfig";
import { correlateKnownVulnerabilities } from "@/lib/analysis/vulnerabilities";
import { LOCALES } from "@/lib/i18n/locales";
import type { Asset, Finding, FindingTextKey } from "@/lib/types";
import { getTranslator } from "@/lib/i18n/messages";

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
  // The shape the real classifier emits, token and all.
  signals: [{ code: "env.nonprod", label: "Possible non-production environment (staging)", confidence: 0.8, rationale: "Hostname begins with staging.", token: "staging" }],
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
    expect(finding.textValues).toEqual({ label: "staging.acme.example", token: "staging" });
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

  it("carries evidence through an enrichment finding's translated sentences", () => {
    // Built from the real misconfiguration generator rather than a hand-made
    // finding, so this breaks if the generator stops emitting its key or its
    // values stop matching the placeholders the catalog expects.
    const subject = asset({
      label: "www.acme.example",
      signals: [],
      attrs: { technologies: [], missingHeaders: ["strict-transport-security", "x-content-type-options"] },
    } as Partial<Asset>);
    const finding = generateMisconfigurationFindings([subject], "2026-03-01T00:00:00.000Z")[0]!;
    expect(finding.textKey).toBe("missingHeaders");

    const sk = findingText(finding, "sk");
    expect(sk.title).toBe("Chýbajúce bezpečnostné hlavičky HTTP");
    // The hostname, the count and the header names are evidence, not prose.
    expect(sk.observation).toContain("www.acme.example");
    expect(sk.observation).toContain("2");
    expect(sk.observation).toContain("strict-transport-security");
    expect(sk.recommendation).toContain("x-content-type-options");
    expect(sk.observation).not.toContain("{");
  });

  it("translates the inference line, including the classifier's own word", () => {
    // The inference was the last English line inside an otherwise translated
    // finding — visible as one English sentence under a Slovak heading.
    const finding = findingFor(asset());
    expect(finding.inference).toBe("Possible non-production environment (staging)");

    const sk = findingText(finding, "sk");
    expect(sk.inference).toBe("Možné neprodukčné prostredie (staging)");

    // A descriptive token is translated with the sentence; "staging" happens to
    // be the same word in Slovak, so assert one that is not.
    const legacy = findingFor(asset({
      label: "legacy.acme.example",
      signals: [{ code: "env.nonprod", label: "Possible non-production environment (legacy naming)", confidence: 0.8, rationale: "r", token: "legacy naming" }],
    } as Partial<Asset>));
    expect(findingText(legacy, "sk").inference).toBe("Možné neprodukčné prostredie (staré pomenovanie)");
  });

  it("leaves a finding with no inference without one", () => {
    // Not every finding infers anything, and inventing an empty line would put
    // a stray heading in the report.
    const newAsset = findingFor(asset({ signals: [], attrs: { technologies: [], newlyObserved: true } } as Partial<Asset>));
    expect(newAsset.textKey).toBe("newAsset");
    expect(findingText(newAsset, "sk").inference).toBeUndefined();
  });

  it("resolves an advisory's own wording from its reference", () => {
    // Built by the real correlator. The advisory's title and recommendation
    // belong to the entry, not to the finding shape, so they are looked up
    // from CVE-2021-41773 rather than stored on the finding.
    const subject = asset({
      label: "www.acme.example",
      signals: [],
      attrs: { technologies: ["Apache/2.4.49"] },
    } as Partial<Asset>);
    const finding = correlateKnownVulnerabilities([subject], "2026-03-01T00:00:00.000Z")[0]!;
    expect(finding.textKey).toBe("vulnerability");

    const sk = findingText(finding, "sk");
    expect(sk.title).toBe("Prechod adresárom a RCE v Apache HTTP Server");
    // The banner, the reference and both version numbers are evidence.
    expect(sk.observation).toContain("Apache/2.4.49");
    expect(sk.recommendation).toContain("2.4.51");
    expect(sk.recommendation).toContain("2.4.50");
    expect(sk.inference).toContain("CVE-2021-41773");
    // The concern opens with the advisory's summary, then the shared caveat.
    expect(sk.concern).toContain("httpd 2.4.49");
    expect(sk.concern).not.toContain("{");
  });

  it("has wording for every key the type allows", () => {
    // Declared as a Record over the union, so adding a FindingTextKey without
    // catalog entries fails to compile rather than reaching a customer as a
    // bare key. The four fields are then checked in all five languages.
    const ALL: Record<FindingTextKey, true> = {
      shadowAsset: true,
      nonProdExposure: true,
      authSurface: true,
      newAsset: true,
      mailSecurity: true,
      missingHeaders: true,
      httpsDowngrade: true,
      certExpired: true,
      certExpiring: true,
      domainLapsed: true,
      domainExpiring: true,
      exposedDatastore: true,
      exposedAdminService: true,
      concentration: true,
      adverseReputation: true,
      maliciousAddress: true,
      domainFlagged: true,
      breachExposure: true,
      // Its title and recommendation are the advisory's, spliced in as values,
      // so the four shared messages are templates rather than sentences.
      vulnerability: true,
    };

    for (const key of Object.keys(ALL) as FindingTextKey[]) {
      for (const { code } of LOCALES) {
        const t = getTranslator(code);
        for (const field of ["Title", "Observation", "Concern", "Recommendation"]) {
          const messageKey = `${key}${field}`;
          const text = t.t("finding", messageKey as never);
          expect(text, `${key}${field} is missing in ${code}`).not.toBe(messageKey);
          expect(text.trim().length, `${key}${field} is empty in ${code}`).toBeGreaterThan(4);
        }
      }
    }
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
