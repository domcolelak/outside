"use client";

/**
 * The client-side half of the translator.
 *
 * Client components cannot resolve the locale themselves — that requires the
 * session and request headers — and letting each one decide would be exactly the
 * fragmentation this layer exists to prevent. Instead the server resolves once
 * and hands down the locale with the messages for it, and every client component
 * reads from here.
 *
 * Only the resolved locale's bundle crosses the wire, never all five. If the
 * catalogs grow large enough for that to matter, this provider is the single
 * place to narrow it to the namespaces a route actually renders.
 */

import { createContext, useContext, useMemo } from "react";
import { DEFAULT_LOCALE, type Locale } from "./locales";
import { buildTranslator, type Bundles, type Translator } from "./messages";

const LocaleContext = createContext<{ locale: Locale; bundles: Bundles } | null>(null);

export function LocaleProvider({ locale, bundles, children }: { locale: Locale; bundles: Bundles; children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, bundles }), [locale, bundles]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/**
 * The translator for the current request, inside a client component.
 *
 * Falls back to English rather than throwing when a component is rendered
 * outside a provider: a missing provider is a bug to fix in review, not a reason
 * to show a customer a broken page.
 */
export function useTranslator(): Translator {
  const context = useContext(LocaleContext);
  return useMemo(
    () => buildTranslator(context?.locale ?? DEFAULT_LOCALE, context?.bundles),
    [context],
  );
}
