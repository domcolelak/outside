import { describe, expect, it } from "vitest";

import { checkTextKey, MAPPED_CHECK_IDS } from "./text";
import { ASSESS_CHECKS } from "./checks";
import { LOCALES } from "@/lib/i18n/locales";
import { getTranslator } from "@/lib/i18n/messages";

/**
 * The assessment checklist is what a customer acts on after a failed check, so
 * a missing translation here reads as a broken product rather than an untranslated
 * one. The check id is the stable thing — a retest diff is keyed on it — so the
 * wording is looked up from the id instead of stored beside it.
 */
describe("assessment check wording", () => {
  it("maps every check in the catalogue", () => {
    // The failure this prevents: a check added to the catalogue without wording,
    // which would render its key on the screen.
    for (const check of ASSESS_CHECKS) {
      expect(MAPPED_CHECK_IDS, `${check.id} has no catalog key`).toContain(check.id);
    }
  });

  it("has no mapping for a check that no longer exists", () => {
    const live = new Set(ASSESS_CHECKS.map((check) => check.id));
    for (const id of MAPPED_CHECK_IDS) {
      expect(live.has(id), `${id} is mapped but not in the catalogue`).toBe(true);
    }
  });

  it("resolves title, rationale and remediation in every language", () => {
    for (const check of ASSESS_CHECKS) {
      for (const { code } of LOCALES) {
        const t = getTranslator(code);
        for (const field of ["Title", "Rationale", "Remediation"] as const) {
          const key = checkTextKey(check.id, field);
          const text = t.t("assess", key);
          expect(text, `${check.id} ${field} is missing in ${code}`).not.toBe(key);
          expect(text.trim().length, `${check.id} ${field} is empty in ${code}`).toBeGreaterThan(4);
        }
      }
    }
  });

  it("keeps the English wording identical to the catalogue's own text", () => {
    // The catalogue still carries English strings for anything reading checks
    // outside the UI. If the two drift, a customer and an API consumer are told
    // different things about the same check.
    const t = getTranslator("en");
    for (const check of ASSESS_CHECKS) {
      expect(t.t("assess", checkTextKey(check.id, "Title")), `${check.id} title drifted`).toBe(check.title);
      expect(t.t("assess", checkTextKey(check.id, "Remediation")), `${check.id} remediation drifted`).toBe(check.remediation);
    }
  });
});
