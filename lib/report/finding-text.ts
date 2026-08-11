/**
 * A finding's wording, in the reader's language.
 *
 * Findings are generated from evidence, persisted, and later replayed into
 * reports and screens. Their prose therefore cannot simply be translated where
 * it is written — the record has to keep what it said at the time. So the
 * generator stores the English sentence and a stable key beside it, and this is
 * where the key becomes words.
 *
 * A finding with no key keeps its English. That covers two real cases: rows
 * written before localization, and generators that have not been keyed yet
 * (currently the enrichment-only ones — misconfiguration, exposed services,
 * threat intelligence, vulnerability correlation and concentration). Both render
 * their original sentence rather than a bare key, which is the difference
 * between a report that mixes languages and one that shows `shadowAssetTitle`.
 *
 * Evidence inside these sentences — hostnames, counts — is interpolated, never
 * translated.
 */

import type { Finding } from "@/lib/types";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import { getTranslator, type MessageKey } from "@/lib/i18n/messages";

export interface FindingText {
  title: string;
  observation: string;
  concern: string;
  recommendation: string;
}

const FIELDS = ["Title", "Observation", "Concern", "Recommendation"] as const;

/** The four sentences a finding shows, translated when it carries a key. */
export function findingText(finding: Finding, locale: Locale = DEFAULT_LOCALE): FindingText {
  const english: FindingText = {
    title: finding.title,
    observation: finding.observation,
    concern: finding.concern,
    recommendation: finding.recommendation,
  };
  if (!finding.textKey || locale === DEFAULT_LOCALE) return english;

  const t = getTranslator(locale);
  const values = finding.textValues ?? {};
  const translated = {} as FindingText;
  for (const field of FIELDS) {
    const key = `${finding.textKey}${field}` as MessageKey<"finding">;
    const rendered = t.t("finding", key, values);
    // The loader answers with the key itself when a message is absent. That is
    // a programming error, not something a customer should ever read.
    const lower = field.toLowerCase() as keyof FindingText;
    translated[lower] = rendered === key ? english[lower] : rendered;
  }
  return translated;
}
