"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LOCALES, type Locale } from "@/lib/i18n/locales";

/**
 * The language selector.
 *
 * Text labels, not flags: a flag is a country, and several of these languages
 * are spoken across borders. Rendered as a real <select> so it is keyboard
 * accessible for free and behaves the way the platform expects on mobile.
 *
 * Changing language preserves the current route and query string — a person
 * switching language mid-task should stay exactly where they are, not be sent
 * back to a landing page.
 */
export function LanguageSwitcher({ current, label }: { current: Locale; label: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);

  async function change(next: string) {
    if (next === current || saving) return;
    setSaving(true);
    try {
      // Persisted server-side so the choice survives a reload and follows the
      // person to another device; the response also sets the signed cookie.
      await fetch("/api/locale", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ locale: next }),
      });
      const query = searchParams.toString();
      startTransition(() => {
        // Re-render the current route on the server with the new locale.
        router.replace(`${pathname}${query ? `?${query}` : ""}`);
        router.refresh();
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <label className="inline-flex items-center gap-2">
      <span className="sr-only">{label}</span>
      <select
        value={current}
        onChange={(event) => void change(event.target.value)}
        disabled={saving || pending}
        aria-label={label}
        className="mono min-h-11 rounded-md border border-line bg-base-900 px-2 py-1 text-xs text-ink-soft transition hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal disabled:opacity-50"
      >
        {LOCALES.map((locale) => (
          // The endonym in the option, the short code as the closed-state label:
          // people recognise their own language written the way they write it.
          <option key={locale.code} value={locale.code}>
            {locale.label} · {locale.endonym}
          </option>
        ))}
      </select>
    </label>
  );
}
