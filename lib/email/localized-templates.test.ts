import { describe, expect, it } from "vitest";

import { changeAlertEmail, inviteEmail, passwordResetEmail, welcomeEmail } from "./templates";
import { organizationLocale, recipientLocale } from "@/lib/i18n/recipient";
import { LOCALES } from "@/lib/i18n/locales";
import type { Monitor } from "@/lib/monitoring";
import type { ChangeEvent } from "@/lib/persistence/model";
import type { ScanResult } from "@/lib/types";

const monitor = { id: "mon_1", orgId: "org_1", domain: "acme.example", frequency: "weekly", enabled: true, lastScanAt: null, nextRunAt: new Date().toISOString(), createdAt: new Date().toISOString() } as unknown as Monitor;
const result = { score: { value: 72 } } as unknown as ScanResult;
const events = [
  { type: "asset_appeared", label: "api.acme.example", detail: "A new public asset appeared on the external surface.", detailKey: "assetAppeared", priority: "medium" },
  { type: "asset_returned", label: "staging.acme.example", detail: "A previously observed asset is publicly reachable again after being absent.", detailKey: "assetReturned", priority: "high" },
] as unknown as ChangeEvent[];

/** Characters each language needs but English does not. */
const DIACRITICS: Record<string, RegExp> = {
  sk: /[áäčďéíĺľňóôŕšťúýž]/i,
  cs: /[áčďéěíňóřšťúůýž]/i,
  pl: /[ąćęłńóśźż]/i,
  hu: /[áéíóöőúüű]/i,
};

describe("localized e-mail", () => {
  it("writes each language in its own alphabet, undamaged", () => {
    // A template that mangles diacritics is worse than an untranslated one: it
    // looks like corruption, and HTML e-mail is where encoding usually breaks.
    for (const [locale, pattern] of Object.entries(DIACRITICS)) {
      const message = changeAlertEmail("member@acme.example", monitor, result, events, locale as never);
      expect(message.html, `${locale} html lost its diacritics`).toMatch(pattern);
      expect(message.text, `${locale} text lost its diacritics`).toMatch(pattern);
      expect(message.html).not.toContain("Ã");
      expect(message.html).not.toContain("&amp;#");
    }
  });

  it("declares the language on the document so mail clients do not offer to translate it", () => {
    for (const { code } of LOCALES) {
      expect(changeAlertEmail("m@acme.example", monitor, result, events, code).html).toContain(`<html lang="${code}"`);
    }
  });

  it("uses the language's own plural rules for the change count", () => {
    // Slovak needs a different word for two changes than for five. A count
    // check instead of Intl would put the wrong one in the subject line.
    const two = changeAlertEmail("m@acme.example", monitor, result, events, "sk").subject;
    const five = changeAlertEmail("m@acme.example", monitor, result, [...events, ...events, events[0]!], "sk").subject;
    expect(two).toContain("2 zmeny");
    expect(five).toContain("5 zmien");
  });

  it("leaves the domain, score and links untranslated in every language", () => {
    // Technical identifiers are evidence. Translating one would make the e-mail
    // disagree with the product it is describing.
    for (const { code } of LOCALES) {
      const message = changeAlertEmail("m@acme.example", monitor, result, events, code);
      expect(message.html).toContain("acme.example");
      expect(message.html).toContain("api.acme.example");
      expect(message.html).toContain("72");
      expect(message.text).toContain("acme.example");
    }
  });

  it("escapes recipient-supplied values rather than the sentence around them", () => {
    // An organization name is attacker-influenced in a self-service product.
    const message = inviteEmail("new@acme.example", '<img src=x onerror="alert(1)">', "admin", "https://outsideguardian.eu/invite/abc", "sk");
    expect(message.html).not.toContain("<img src=x");
    expect(message.html).toContain("&lt;img src=x");
    // The markup the template itself adds must survive escaping.
    expect(message.html).toContain("<a href=");
  });

  it("translates the explanation of each change, not just its label", () => {
    const sk = changeAlertEmail("m@acme.example", monitor, result, events, "sk");
    expect(sk.html).toContain("Na vonkajšom povrchu sa objavil nový verejný asset.");
    expect(sk.html).not.toContain("A new public asset appeared");
  });

  it("keeps a change recorded before localization readable", () => {
    // Events persist. A row written by an earlier release has the English
    // sentence and no key, and must still render rather than showing a key.
    const legacy = [{ type: "asset_appeared", label: "old.acme.example", detail: "A new public asset appeared on the external surface.", priority: "medium" }] as unknown as ChangeEvent[];
    const message = changeAlertEmail("m@acme.example", monitor, result, legacy, "sk");
    expect(message.html).toContain("A new public asset appeared on the external surface.");
    // The surrounding e-mail is still Slovak.
    expect(message.html).toContain("Zobraziť vonkajší povrch");
  });

  it("falls back to English rather than failing when no language is given", () => {
    expect(passwordResetEmail("someone@acme.example", "https://outsideguardian.eu/reset").html).toContain('<html lang="en"');
    expect(welcomeEmail("someone@acme.example", "Alex Rivera").subject).toBe("Welcome to OUTSIDE");
  });

  it("greets a person by their first name in every language", () => {
    expect(welcomeEmail("a@acme.example", "Alex Rivera", undefined, "sk").html).toContain("Alex");
    expect(welcomeEmail("a@acme.example", "Alex Rivera", undefined, "hu").html).toContain("Alex");
  });
});

describe("which language an artifact is written in", () => {
  it("prefers the recipient's own choice over their organization's default", () => {
    expect(recipientLocale({ userPreference: "sk", organizationDefault: "pl" })).toBe("sk");
  });

  it("uses the organization default when the recipient has not chosen", () => {
    expect(recipientLocale({ userPreference: null, organizationDefault: "pl" })).toBe("pl");
  });

  it("ignores a stale or unsupported value instead of failing to send", () => {
    // A locale left in a row by an earlier release must not stop an alert.
    expect(recipientLocale({ userPreference: "de", organizationDefault: "cs" })).toBe("cs");
    expect(recipientLocale({ userPreference: "de", organizationDefault: "es" })).toBe("en");
    expect(recipientLocale({})).toBe("en");
  });

  it("uses the organization default for someone who has no account yet", () => {
    expect(organizationLocale("hu")).toBe("hu");
    expect(organizationLocale(null)).toBe("en");
  });
});
