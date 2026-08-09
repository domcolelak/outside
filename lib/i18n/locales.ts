/**
 * The supported-locale registry.
 *
 * Locale codes are BCP 47 identifiers and are the only values ever stored or
 * compared. Czech is `cs`; the selector displays "CZ" because that is what
 * customers in the region recognise, but `cz` is not a language code and never
 * reaches the database, a cookie or a URL.
 *
 * Locales are validated against this registry rather than a Prisma enum, so
 * adding a language is a code change plus message files — not a schema
 * migration on every table that stores one.
 */

export const LOCALES = [
  { code: "en", label: "EN", language: "English", endonym: "English" },
  { code: "sk", label: "SK", language: "Slovak", endonym: "Slovenčina" },
  { code: "cs", label: "CZ", language: "Czech", endonym: "Čeština" },
  { code: "hu", label: "HU", language: "Hungarian", endonym: "Magyar" },
  { code: "pl", label: "PL", language: "Polish", endonym: "Polski" },
] as const;

export type Locale = (typeof LOCALES)[number]["code"];

export const DEFAULT_LOCALE: Locale = "en";

const CODES = new Set<string>(LOCALES.map((entry) => entry.code));

/** Narrow an untrusted value to a supported locale, or null. */
export function asLocale(value: unknown): Locale | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return CODES.has(normalized) ? (normalized as Locale) : null;
}

export function localeMeta(code: Locale) {
  return LOCALES.find((entry) => entry.code === code) ?? LOCALES[0];
}

/**
 * Best supported match for an Accept-Language header.
 *
 * Quality values are honoured, and a regional tag falls back to its base
 * language so `cs-CZ`, `sk-SK` and `pl-PL` resolve rather than being ignored.
 */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const candidates = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      const quality = q ? Number.parseFloat(q.split("=")[1] ?? "") : 1;
      return { tag: (tag ?? "").trim().toLowerCase(), quality: Number.isFinite(quality) ? quality : 0 };
    })
    .filter((entry) => entry.tag && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality);

  for (const { tag } of candidates) {
    const exact = asLocale(tag);
    if (exact) return exact;
    const base = asLocale(tag.split("-")[0]);
    if (base) return base;
  }
  return null;
}
