/**
 * Server-side entry point for the effective locale.
 *
 * Every server component asks here rather than reimplementing the resolution
 * order, so `<html lang>`, page copy and e-mail rendering can never disagree
 * about what language the request is in.
 */

import { cookies, headers } from "next/headers";
import { getSessionContext } from "@/lib/auth";
import { LOCALE_COOKIE } from "./cookie";
import { resolveLocale, type ResolvedLocale } from "./resolve";
import { getTranslator, type Translator } from "./messages";

/**
 * Resolve the locale for the current request.
 *
 * Session lookup is best-effort: a signed-out visitor, or an auth store that is
 * unavailable, must still get a rendered page in a sensible language rather than
 * an error.
 */
export async function currentLocale(): Promise<ResolvedLocale> {
  const [jar, headerList] = await Promise.all([cookies(), headers()]);

  let userPreference: string | null = null;
  let organizationDefault: string | null = null;
  try {
    const ctx = await getSessionContext();
    if (ctx) {
      userPreference = ctx.user.preferredLocale ?? null;
      // The first organization is the one the app treats as primary elsewhere.
      organizationDefault = ctx.memberships[0]?.org.defaultLocale ?? null;
    }
  } catch {
    // Rendering must not depend on the session store being reachable.
  }

  return resolveLocale({
    userPreference,
    organizationDefault,
    cookieValue: jar.get(LOCALE_COOKIE)?.value ?? null,
    acceptLanguage: headerList.get("accept-language"),
  });
}

/** The translator for the current request. */
export async function currentTranslator(): Promise<Translator> {
  const { locale } = await currentLocale();
  return getTranslator(locale);
}
