/**
 * The language an artifact addressed to somebody should be written in.
 *
 * Distinct from the request-time resolution in ./resolve: there is no request
 * here. A scheduled alert, a queued invitation and a generated report are
 * produced by a worker with no browser, no cookie and no Accept-Language, so
 * the only honest inputs are what the recipient and their organization have
 * chosen.
 *
 * The rule the product commits to: an organization-wide artifact uses the
 * organization default, unless the individual recipient has chosen a language
 * for themselves. A default supplies a starting point; it never overrides a
 * person's own choice.
 */

import { asLocale, DEFAULT_LOCALE, type Locale } from "./locales";

export interface RecipientLocaleInput {
  /** The recipient's stored preference, when they have an account. */
  userPreference?: string | null;
  /** The organization the artifact belongs to. */
  organizationDefault?: string | null;
}

/**
 * Resolve the language for one recipient.
 *
 * Unsupported or unknown values fall through rather than fail: a stale locale
 * left in a row by an earlier release must not stop an alert from being sent.
 */
export function recipientLocale(input: RecipientLocaleInput): Locale {
  return asLocale(input.userPreference) ?? asLocale(input.organizationDefault) ?? DEFAULT_LOCALE;
}

/**
 * The language for an artifact addressed to a group.
 *
 * An invitation to somebody who has no account yet, or a report attached to an
 * organization rather than a person, has no individual preference to honour —
 * the organization default is the whole answer.
 */
export function organizationLocale(organizationDefault?: string | null): Locale {
  return asLocale(organizationDefault) ?? DEFAULT_LOCALE;
}
