"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const CLASS = "mono hidden px-3 py-1.5 text-xs text-ink-soft hover:text-ink sm:block";

/**
 * Landing-page auth link. The landing stays static/cacheable; this small client
 * component checks the session and shows "Account" when signed in, "Sign in"
 * otherwise — so returning to the homepage while logged in no longer looks like
 * a sign-out. Defaults to "Sign in" (the common anonymous case) until known.
 */
export function NavAuthLink() {
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
    ? <Link href="/account" className={CLASS}>Account</Link>
    : <Link href="/login" className={CLASS}>Sign in</Link>;
}
