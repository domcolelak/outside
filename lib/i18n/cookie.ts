/**
 * The anonymous-visitor locale cookie.
 *
 * A locale is not a secret, but it is an input that reaches rendering, so it is
 * integrity-protected rather than trusted verbatim: a tampered cookie falls back
 * to the next resolution step instead of being honoured. The HMAC reuses the
 * application's own verification secrets, so rotating AUTH_SECRET rotates this
 * too and an old cookie keeps validating during the overlap.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { authSecret, authVerificationSecrets } from "@/lib/config/secrets";
import { asLocale, type Locale } from "./locales";

export const LOCALE_COOKIE = "outside_locale";
/** A year: a language choice should outlive a session. */
export const LOCALE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

/** Serialize a locale with its signature. */
export function signLocaleCookie(locale: Locale): string {
  return `${locale}.${sign(locale, authSecret())}`;
}

/**
 * Read a locale from a cookie value, or null when it is absent, malformed,
 * unsupported or not correctly signed.
 */
export function readLocaleCookie(value: string | undefined | null): Locale | null {
  if (!value) return null;
  const separator = value.lastIndexOf(".");
  if (separator <= 0) return null;

  const candidate = value.slice(0, separator);
  const locale = asLocale(candidate);
  if (!locale) return null;

  const provided = Buffer.from(value.slice(separator + 1));
  // Any secret in the rotation window may have signed it.
  const valid = authVerificationSecrets().some((secret) => {
    const expected = Buffer.from(sign(locale, secret));
    return expected.length === provided.length && timingSafeEqual(expected, provided);
  });
  return valid ? locale : null;
}
