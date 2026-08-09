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
import skCommon from "@/messages/sk/common.json";
import skNavigation from "@/messages/sk/navigation.json";
import csCommon from "@/messages/cs/common.json";
import csNavigation from "@/messages/cs/navigation.json";
import huCommon from "@/messages/hu/common.json";
import huNavigation from "@/messages/hu/navigation.json";
import plCommon from "@/messages/pl/common.json";
import plNavigation from "@/messages/pl/navigation.json";

/** Namespaces are separate files so no locale becomes one unreviewable blob. */
const BUNDLES = {
  en: { common: enCommon, navigation: enNavigation },
  sk: { common: skCommon, navigation: skNavigation },
  cs: { common: csCommon, navigation: csNavigation },
  hu: { common: huCommon, navigation: huNavigation },
  pl: { common: plCommon, navigation: plNavigation },
} as const;

export type Namespace = keyof (typeof BUNDLES)["en"];
/** The English bundle defines the key space every locale must match. */
export type MessageKey<N extends Namespace> = keyof (typeof BUNDLES)["en"][N] & string;

type PluralForms = { one?: string; few?: string; many?: string; other: string };
type MessageValue = string | PluralForms;

function bundle(locale: Locale, namespace: Namespace): Record<string, MessageValue> {
  return BUNDLES[locale][namespace] as unknown as Record<string, MessageValue>;
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
  return {
    locale,
    t(namespace, key, values) {
      const entry = bundle(locale, namespace)[key] ?? bundle(DEFAULT_LOCALE, namespace)[key];
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
