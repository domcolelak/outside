import { describe, expect, it } from "vitest";

import { capabilityTextKey, CATEGORY_KEY, MAPPED_CAPABILITY_IDS } from "./text";
import { CAPABILITIES } from "./registry";
import { LOCALES } from "@/lib/i18n/locales";
import { getTranslator } from "@/lib/i18n/messages";

/**
 * The capability registry is the page that states what the product can do. It
 * is already held to the code by a test that fails when a capability drifts
 * from what a real scan produces; this holds its wording to the catalog the
 * same way.
 */
describe("capability wording", () => {
  it("names every capability in the registry", () => {
    for (const capability of CAPABILITIES) {
      expect(MAPPED_CAPABILITY_IDS, `${capability.id} has no catalog key`).toContain(capability.id);
    }
  });

  it("names nothing that has left the registry", () => {
    const live = new Set(CAPABILITIES.map((capability) => capability.id));
    for (const id of MAPPED_CAPABILITY_IDS) {
      expect(live.has(id), `${id} is mapped but not in the registry`).toBe(true);
    }
  });

  it("resolves a name and description in every language", () => {
    for (const capability of CAPABILITIES) {
      for (const { code } of LOCALES) {
        const t = getTranslator(code);
        for (const field of ["Name", "Description"] as const) {
          const key = capabilityTextKey(capability.id, field)!;
          const text = t.t("capabilities", key);
          expect(text, `${capability.id} ${field} is missing in ${code}`).not.toBe(key);
          expect(text.trim().length, `${capability.id} ${field} is empty in ${code}`).toBeGreaterThan(4);
        }
      }
    }
  });

  it("keeps the English identical to the registry's own wording", () => {
    const t = getTranslator("en");
    for (const capability of CAPABILITIES) {
      expect(t.t("capabilities", capabilityTextKey(capability.id, "Name")!), `${capability.id} name drifted`).toBe(capability.name);
      expect(t.t("capabilities", capabilityTextKey(capability.id, "Description")!), `${capability.id} description drifted`).toBe(capability.description);
    }
  });

  it("labels every category a capability claims to detect", () => {
    // A capability can only report categories the page knows how to label;
    // an unlabelled one would render its raw slug next to translated siblings.
    for (const capability of CAPABILITIES) {
      for (const category of capability.detects) {
        expect(CATEGORY_KEY[category], `${category} has no label`).toBeDefined();
      }
    }
  });

  it("falls back for a capability the catalog does not know", () => {
    expect(capabilityTextKey("CAP-NOT-REAL", "Name")).toBeNull();
  });
});
