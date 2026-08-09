/**
 * Effective-locale resolution.
 *
 * The order is fixed and deliberate: the most specific expression of intent
 * wins, and each step only applies when the one above it said nothing.
 *
 *   1. An explicit change the user just made        (the request carries it)
 *   2. The signed-in user's stored preference
 *   3. Their organization's default
 *   4. A signed cookie, for anonymous visitors
 *   5. A supported match from Accept-Language
 *   6. English
 *
 * Steps 2 and 3 are separate on purpose: an organization default should furnish
 * a sensible starting language for everyone in it without ever overriding a
 * person who has chosen one.
 */

import { asLocale, localeFromAcceptLanguage, DEFAULT_LOCALE, type Locale } from "./locales";
import { readLocaleCookie } from "./cookie";

export interface LocaleSources {
  /** An explicit switch on this request, e.g. ?lang= or a just-set header. */
  explicit?: string | null;
  /** The authenticated user's stored preference. */
  userPreference?: string | null;
  /** The organization's default, used only when the user has no preference. */
  organizationDefault?: string | null;
  /** Raw value of the locale cookie, verified before it is trusted. */
  cookieValue?: string | null;
  acceptLanguage?: string | null;
}

export interface ResolvedLocale {
  locale: Locale;
  /** Which step decided, so behaviour is explainable and testable. */
  source: "explicit" | "user" | "organization" | "cookie" | "header" | "default";
}

export function resolveLocale(sources: LocaleSources): ResolvedLocale {
  const explicit = asLocale(sources.explicit);
  if (explicit) return { locale: explicit, source: "explicit" };

  const user = asLocale(sources.userPreference);
  if (user) return { locale: user, source: "user" };

  const organization = asLocale(sources.organizationDefault);
  if (organization) return { locale: organization, source: "organization" };

  const cookie = readLocaleCookie(sources.cookieValue);
  if (cookie) return { locale: cookie, source: "cookie" };

  const header = localeFromAcceptLanguage(sources.acceptLanguage);
  if (header) return { locale: header, source: "header" };

  return { locale: DEFAULT_LOCALE, source: "default" };
}
