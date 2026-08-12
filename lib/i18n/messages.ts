/**
 * The message loader.
 *
 * A thin, typed loader rather than an i18n library: Next.js 16 and React 19 are
 * recent enough that third-party compatibility could not be asserted without
 * verifying it, and changing the pinned framework to satisfy a translation
 * dependency is the wrong trade.
 *
 * English is the source of truth for the key space. Every other locale is
 * compared against it by scripts/check-messages.mjs, which fails the build on a
 * missing, extra or structurally incompatible key — so a half-translated release
 * cannot ship silently.
 *
 * Nothing here calls a model. Product copy, security terminology, findings,
 * e-mails and reports come from reviewed files; translating them at request time
 * would make the words a customer acts on non-deterministic.
 */

import { DEFAULT_LOCALE, type Locale } from "./locales";

import enCommon from "@/messages/en/common.json";
import enNavigation from "@/messages/en/navigation.json";
import enLanding from "@/messages/en/landing.json";
import enAuth from "@/messages/en/auth.json";
import enEmail from "@/messages/en/email.json";
import enReport from "@/messages/en/report.json";
import enFinding from "@/messages/en/finding.json";
import enAccount from "@/messages/en/account.json";
import enBilling from "@/messages/en/billing.json";
import enGuardian from "@/messages/en/guardian.json";
import enChronos from "@/messages/en/chronos.json";
import enIntegrations from "@/messages/en/integrations.json";
import enCapabilities from "@/messages/en/capabilities.json";
import enAssess from "@/messages/en/assess.json";
import enSupport from "@/messages/en/support.json";
import skCommon from "@/messages/sk/common.json";
import skNavigation from "@/messages/sk/navigation.json";
import skLanding from "@/messages/sk/landing.json";
import skAuth from "@/messages/sk/auth.json";
import skEmail from "@/messages/sk/email.json";
import skReport from "@/messages/sk/report.json";
import skFinding from "@/messages/sk/finding.json";
import skAccount from "@/messages/sk/account.json";
import skBilling from "@/messages/sk/billing.json";
import skGuardian from "@/messages/sk/guardian.json";
import skChronos from "@/messages/sk/chronos.json";
import skIntegrations from "@/messages/sk/integrations.json";
import skCapabilities from "@/messages/sk/capabilities.json";
import skAssess from "@/messages/sk/assess.json";
import skSupport from "@/messages/sk/support.json";
import csCommon from "@/messages/cs/common.json";
import csNavigation from "@/messages/cs/navigation.json";
import csLanding from "@/messages/cs/landing.json";
import csAuth from "@/messages/cs/auth.json";
import csEmail from "@/messages/cs/email.json";
import csReport from "@/messages/cs/report.json";
import csFinding from "@/messages/cs/finding.json";
import csAccount from "@/messages/cs/account.json";
import csBilling from "@/messages/cs/billing.json";
import csGuardian from "@/messages/cs/guardian.json";
import csChronos from "@/messages/cs/chronos.json";
import csIntegrations from "@/messages/cs/integrations.json";
import csCapabilities from "@/messages/cs/capabilities.json";
import csAssess from "@/messages/cs/assess.json";
import csSupport from "@/messages/cs/support.json";
import huCommon from "@/messages/hu/common.json";
import huNavigation from "@/messages/hu/navigation.json";
import huLanding from "@/messages/hu/landing.json";
import huAuth from "@/messages/hu/auth.json";
import huEmail from "@/messages/hu/email.json";
import huReport from "@/messages/hu/report.json";
import huFinding from "@/messages/hu/finding.json";
import huAccount from "@/messages/hu/account.json";
import huBilling from "@/messages/hu/billing.json";
import huGuardian from "@/messages/hu/guardian.json";
import huChronos from "@/messages/hu/chronos.json";
import huIntegrations from "@/messages/hu/integrations.json";
import huCapabilities from "@/messages/hu/capabilities.json";
import huAssess from "@/messages/hu/assess.json";
import huSupport from "@/messages/hu/support.json";
import plCommon from "@/messages/pl/common.json";
import plNavigation from "@/messages/pl/navigation.json";
import plLanding from "@/messages/pl/landing.json";
import plAuth from "@/messages/pl/auth.json";
import plEmail from "@/messages/pl/email.json";
import plReport from "@/messages/pl/report.json";
import plFinding from "@/messages/pl/finding.json";
import plAccount from "@/messages/pl/account.json";
import plBilling from "@/messages/pl/billing.json";
import plGuardian from "@/messages/pl/guardian.json";
import plChronos from "@/messages/pl/chronos.json";
import plIntegrations from "@/messages/pl/integrations.json";
import plCapabilities from "@/messages/pl/capabilities.json";
import plAssess from "@/messages/pl/assess.json";
import plSupport from "@/messages/pl/support.json";

/** Namespaces are separate files so no locale becomes one unreviewable blob. */
const BUNDLES = {
  en: { common: enCommon, navigation: enNavigation, landing: enLanding, auth: enAuth, email: enEmail, report: enReport, support: enSupport, finding: enFinding, account: enAccount, billing: enBilling, guardian: enGuardian, assess: enAssess, chronos: enChronos, integrations: enIntegrations, capabilities: enCapabilities },
  sk: { common: skCommon, navigation: skNavigation, landing: skLanding, auth: skAuth, email: skEmail, report: skReport, support: skSupport, finding: skFinding, account: skAccount, billing: skBilling, guardian: skGuardian, assess: skAssess, chronos: skChronos, integrations: skIntegrations, capabilities: skCapabilities },
  cs: { common: csCommon, navigation: csNavigation, landing: csLanding, auth: csAuth, email: csEmail, report: csReport, support: csSupport, finding: csFinding, account: csAccount, billing: csBilling, guardian: csGuardian, assess: csAssess, chronos: csChronos, integrations: csIntegrations, capabilities: csCapabilities },
  hu: { common: huCommon, navigation: huNavigation, landing: huLanding, auth: huAuth, email: huEmail, report: huReport, support: huSupport, finding: huFinding, account: huAccount, billing: huBilling, guardian: huGuardian, assess: huAssess, chronos: huChronos, integrations: huIntegrations, capabilities: huCapabilities },
  pl: { common: plCommon, navigation: plNavigation, landing: plLanding, auth: plAuth, email: plEmail, report: plReport, support: plSupport, finding: plFinding, account: plAccount, billing: plBilling, guardian: plGuardian, assess: plAssess, chronos: plChronos, integrations: plIntegrations, capabilities: plCapabilities },
} as const;

export type Namespace = keyof (typeof BUNDLES)["en"];
/** One locale's messages, as handed to the client. */
export type Bundles = (typeof BUNDLES)[Locale];

/** The messages for a locale, for serialising to a client provider. */
export function getBundles(locale: Locale): Bundles {
  return BUNDLES[locale];
}
/** The English bundle defines the key space every locale must match. */
export type MessageKey<N extends Namespace> = keyof (typeof BUNDLES)["en"][N] & string;

type PluralForms = { one?: string; few?: string; many?: string; other: string };
type MessageValue = string | PluralForms;

function bundle(locale: Locale, namespace: Namespace, override?: Bundles): Record<string, MessageValue> {
  return (override ?? BUNDLES[locale])[namespace] as unknown as Record<string, MessageValue>;
}

/**
 * Pick a plural form using the locale's own rules. Slavic languages distinguish
 * one/few/many, which English does not, so this is delegated to Intl rather than
 * approximated with a count check.
 */
function plural(locale: Locale, forms: PluralForms, count: number): string {
  const category = new Intl.PluralRules(locale).select(count);
  if (category === "one" && forms.one) return forms.one;
  if (category === "few" && forms.few) return forms.few;
  if (category === "many" && forms.many) return forms.many;
  return forms.other;
}

/** Replace {placeholders}. Whole sentences are translated, never concatenated. */
function interpolate(template: string, values: Record<string, string | number> | undefined): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = values[name];
    return value === undefined ? match : String(value);
  });
}

export interface Translator {
  locale: Locale;
  /** Translate a key, with optional interpolation values and a plural count. */
  t<N extends Namespace>(namespace: N, key: MessageKey<N>, values?: Record<string, string | number> & { count?: number }): string;
  /** Locale-aware date and number formatting, so output matches the language. */
  formatDate(value: Date | string, options?: Intl.DateTimeFormatOptions): string;
  formatNumber(value: number, options?: Intl.NumberFormatOptions): string;
}

export function getTranslator(locale: Locale): Translator {
  return buildTranslator(locale);
}

/**
 * The translator itself. `bundles` lets a client provider supply the messages it
 * was handed, so the same code path serves the server and the browser.
 */
export function buildTranslator(locale: Locale, bundles?: Bundles): Translator {
  return {
    locale,
    t(namespace, key, values) {
      const entry = bundle(locale, namespace, bundles)[key] ?? bundle(DEFAULT_LOCALE, namespace)[key];
      // A key with no English either is a programming error, not a user-facing
      // one: show the key rather than an empty space, and let CI catch it.
      if (entry === undefined) return key;
      const template = typeof entry === "string" ? entry : plural(locale, entry, Number(values?.count ?? 0));
      return interpolate(template, values);
    },
    formatDate(value, options) {
      const date = value instanceof Date ? value : new Date(value);
      return new Intl.DateTimeFormat(locale, options ?? { dateStyle: "medium" }).format(date);
    },
    formatNumber(value, options) {
      return new Intl.NumberFormat(locale, options).format(value);
    },
  };
}
