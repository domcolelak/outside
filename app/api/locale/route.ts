import { NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { getAuthStore } from "@/lib/auth";
import { readLimitedJson, RequestBodyError } from "@/lib/http/body";
import { asLocale } from "@/lib/i18n/locales";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, signLocaleCookie } from "@/lib/i18n/cookie";
import { operationalLog } from "@/lib/observability/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Record a language choice.
 *
 * The cookie is always set, so the choice survives for anonymous visitors and
 * for the request that renders immediately after. A signed-in user additionally
 * gets it stored, which is what makes the preference follow them to another
 * device — and what stops an organization default from overriding them later.
 *
 * Changing one's own language needs no special role. It is a display preference,
 * not an authorization decision.
 */
export async function POST(req: NextRequest) {
  let body: { locale?: unknown };
  try {
    body = (await readLimitedJson(req, 500)) as typeof body;
  } catch (error) {
    return NextResponse.json({ error: error instanceof RequestBodyError ? error.message : "Invalid request." }, { status: 400 });
  }

  const locale = asLocale(body.locale);
  if (!locale) return NextResponse.json({ error: "Unsupported language." }, { status: 400 });

  const response = NextResponse.json({ locale });
  response.cookies.set(LOCALE_COOKIE, signLocaleCookie(locale), {
    httpOnly: false, // read by no script, but harmless: a locale is not a secret
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
  });

  const ctx = await getSessionContext();
  if (ctx) {
    try {
      const store = await getAuthStore();
      await store.setPreferredLocale?.(ctx.user.id, locale);
    } catch (error) {
      // The cookie already carries the choice, so the language still changes.
      // Losing the durable copy is worth a log, not a failed request.
      operationalLog("warn", "i18n.preference_not_persisted", { userId: ctx.user.id, locale }, error);
    }
  }

  return response;
}
