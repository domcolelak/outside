import { describe, expect, it } from "vitest";
import { LOCALES } from "@/lib/i18n/locales";
import { privacyDocument, securityDocument, termsDocument } from "./documents";

const documents = [privacyDocument, termsDocument, securityDocument];

describe("localized legal documents", () => {
  it("provides a substantive version of every document in every supported locale", () => {
    for (const { code } of LOCALES) {
      for (const getDocument of documents) {
        const document = getDocument(code);
        expect(document.title.length, `${code} title`).toBeGreaterThan(5);
        expect(document.updated, `${code} updated date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(document.body.length, `${code} body`).toBeGreaterThan(2_000);
        expect(document.body, `${code} contact`).toContain("security@outsideguardian.eu");
      }
    }
  });

  it("does not serve the English legal bodies to another locale", () => {
    for (const { code } of LOCALES.filter(({ code }) => code !== "en")) {
      expect(privacyDocument(code).body).not.toBe(privacyDocument("en").body);
      expect(termsDocument(code).body).not.toBe(termsDocument("en").body);
      expect(securityDocument(code).body).not.toBe(securityDocument("en").body);
    }
  });
});
