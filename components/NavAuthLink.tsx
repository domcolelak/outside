"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslator } from "@/lib/i18n/context";

// whitespace-nowrap: "Prihlásiť sa" and "Bejelentkezés" are wider than "Sign in"
// and broke across two lines in the header.
const CLASS = "mono whitespace-nowrap rounded-md px-2 py-1.5 text-xs text-ink-soft hover:bg-base-700 hover:text-ink sm:px-3";

/**
 * Landing-page auth link. The landing stays static/cacheable; this small client
 * component checks the session and shows "Account" when signed in, "Sign in"
 * otherwise — so returning to the homepage while logged in no longer looks like
 * a sign-out. Defaults to "Sign in" (the common anonymous case) until known.
 */
export function NavAuthLink() {
  const t = useTranslator();
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => { if (alive) setAuthed(!!d.authenticated); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  return authed
    ? <Link href="/account" className={CLASS}>{t.t("landing", "navAccount")}</Link>
    : <Link href="/login" className={CLASS}>{t.t("landing", "navSignIn")}</Link>;
}
