import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubEnv("AUTH_SECRET", "i18n-test-auth-secret-at-least-thirty-two-bytes");

import { asLocale, localeFromAcceptLanguage, LOCALES } from "./locales";
import { signLocaleCookie, readLocaleCookie } from "./cookie";
import { resolveLocale } from "./resolve";
import { getTranslator } from "./messages";
import enCommon from "@/messages/en/common.json";
import enNavigation from "@/messages/en/navigation.json";
import enLanding from "@/messages/en/landing.json";

/** English defines the key space every locale has to cover. */
const englishKeys = { common: enCommon, navigation: enNavigation, landing: enLanding };

afterEach(() => vi.restoreAllMocks());

describe("locale registry", () => {
  it("uses cs for Czech and never cz, even though the label reads CZ", () => {
    // cz is a country code, not a language. It must never reach storage or a URL.
    const czech = LOCALES.find((entry) => entry.code === "cs");
    expect(czech?.label).toBe("CZ");
    expect(asLocale("cz")).toBeNull();
    expect(asLocale("cs")).toBe("cs");
  });

  it("rejects anything not in the registry", () => {
    expect(asLocale("de")).toBeNull();
    expect(asLocale("")).toBeNull();
    expect(asLocale(undefined)).toBeNull();
    expect(asLocale("../../etc/passwd")).toBeNull();
  });
});

describe("Accept-Language", () => {
  it("honours quality values", () => {
    expect(localeFromAcceptLanguage("de;q=0.9, pl;q=1.0")).toBe("pl");
  });

  it("falls back from a regional tag to its base language", () => {
    expect(localeFromAcceptLanguage("cs-CZ,cs;q=0.9")).toBe("cs");
    expect(localeFromAcceptLanguage("sk-SK")).toBe("sk");
  });

  it("returns null when nothing is supported", () => {
    expect(localeFromAcceptLanguage("de-DE,fr;q=0.8")).toBeNull();
    expect(localeFromAcceptLanguage(null)).toBeNull();
  });
});

describe("the locale cookie is integrity-protected", () => {
  it("round-trips a signed locale", () => {
    expect(readLocaleCookie(signLocaleCookie("hu"))).toBe("hu");
  });

  it("refuses a tampered or unsigned value", () => {
    // A locale is not a secret, but it reaches rendering, so a forged cookie
    // must fall through to the next resolution step rather than be honoured.
    expect(readLocaleCookie("pl")).toBeNull();
    expect(readLocaleCookie("pl.not-a-signature")).toBeNull();
    const signed = signLocaleCookie("pl");
    expect(readLocaleCookie(signed.replace("pl.", "sk."))).toBeNull();
  });

  it("refuses a correctly signed but unsupported locale", () => {
    expect(readLocaleCookie(signLocaleCookie("en").replace("en.", "de."))).toBeNull();
  });
});

describe("resolution order", () => {
  const cookie = signLocaleCookie("hu");

  it("prefers an explicit change over everything else", () => {
    expect(resolveLocale({ explicit: "pl", userPreference: "sk", organizationDefault: "cs", cookieValue: cookie, acceptLanguage: "en" }))
      .toEqual({ locale: "pl", source: "explicit" });
  });

  it("prefers the person's stored choice over their organization's default", () => {
    // An organization default supplies a starting language; it must never
    // override someone who has chosen for themselves.
    expect(resolveLocale({ userPreference: "sk", organizationDefault: "cs" })).toEqual({ locale: "sk", source: "user" });
  });

  it("uses the organization default only when the person has not chosen", () => {
    expect(resolveLocale({ userPreference: null, organizationDefault: "cs" })).toEqual({ locale: "cs", source: "organization" });
  });

  it("uses the signed cookie for anonymous visitors", () => {
    expect(resolveLocale({ cookieValue: cookie, acceptLanguage: "pl" })).toEqual({ locale: "hu", source: "cookie" });
  });

  it("falls back to Accept-Language, then to English", () => {
    expect(resolveLocale({ acceptLanguage: "pl-PL" })).toEqual({ locale: "pl", source: "header" });
    expect(resolveLocale({})).toEqual({ locale: "en", source: "default" });
  });

  it("ignores unsupported values at every step instead of failing", () => {
    expect(resolveLocale({ explicit: "de", userPreference: "fr", organizationDefault: "es", acceptLanguage: "sk" }))
      .toEqual({ locale: "sk", source: "header" });
  });
});

describe("translation", () => {
  it("interpolates whole sentences rather than concatenating fragments", () => {
    expect(getTranslator("sk").t("common", "languageChanged", { language: "Slovenčina" }))
      .toBe("Jazyk zmenený na Slovenčina.");
  });

  it("uses each language's own plural rules", () => {
    // Slovak distinguishes one / few / other where English has only two forms;
    // a count check instead of Intl would render the wrong words for 2-4.
    const sk = getTranslator("sk");
    expect(sk.t("common", "assetCount", { count: 1 })).toBe("1 asset");
    expect(sk.t("common", "assetCount", { count: 3 })).toBe("3 assety");
    expect(sk.t("common", "assetCount", { count: 7 })).toBe("7 assetov");

    const pl = getTranslator("pl");
    expect(pl.t("common", "assetCount", { count: 1 })).toBe("1 zasób");
    expect(pl.t("common", "assetCount", { count: 3 })).toBe("3 zasoby");
    expect(pl.t("common", "assetCount", { count: 7 })).toBe("7 zasobów");
  });

  it("keeps the security terminology distinct in every language", () => {
    // Blurring observed / derived / verified across languages would let a
    // translation quietly upgrade an inference into a confirmed fact.
    for (const { code } of LOCALES) {
      const t = getTranslator(code);
      const terms = ["observed", "derived", "possibleRisk", "verified"] as const;
      const rendered = terms.map((term) => t.t("common", term));
      expect(new Set(rendered).size, `${code} blurs a terminology boundary`).toBe(terms.length);
    }
  });

  it("formats numbers and dates in the requested language", () => {
    expect(getTranslator("pl").formatNumber(1234.5)).not.toBe(getTranslator("en").formatNumber(1234.5));
    expect(getTranslator("sk").formatDate("2026-03-15T00:00:00.000Z")).toBeTruthy();
  });

  it("resolves every key in every locale, so no screen can show a raw key", () => {
    // The loader returns the key itself when a message is absent. That is the
    // right behaviour at runtime and the wrong thing to ever ship, so every key
    // in every namespace is rendered here.
    for (const { code } of LOCALES) {
      const t = getTranslator(code);
      for (const namespace of ["common", "navigation", "landing"] as const) {
        for (const key of Object.keys(englishKeys[namespace])) {
          const rendered = t.t(namespace, key as never, { count: 1, language: "x" });
          expect(rendered, `${code}/${namespace}.${key} is unresolved`).not.toBe(key);
          expect(rendered.trim(), `${code}/${namespace}.${key} is empty`).not.toBe("");
        }
      }
    }
  });

  it("falls back to English rather than rendering nothing for a missing key", () => {
    const t = getTranslator("hu");
    expect(t.t("navigation", "guardian")).toBe("Guardian");
  });
});
