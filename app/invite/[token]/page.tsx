"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Wordmark } from "@/components/Wordmark";

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [state, setState] = useState<"working" | "needsAuth" | "error" | "done">("working");
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/invites/accept", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: params.token }) });
        const data = await res.json();
        if (res.status === 401) {
          setState("needsAuth");
          return;
        }
        if (!res.ok) {
          setState("error");
          setMessage(data.error ?? "Could not accept invitation.");
          return;
        }
        setState("done");
        setTimeout(() => router.push("/account"), 1200);
      } catch {
        setState("error");
        setMessage("Network error. Try again.");
      }
    })();
  }, [params.token, router]);

  return (
    <div className="relative flex min-h-screen items-center justify-center px-6 text-center">
      <div className="grid-backdrop pointer-events-none absolute inset-0" />
      <div className="panel relative max-w-sm p-8">
        <Link href="/"><Wordmark className="mx-auto mb-6 h-6" /></Link>
        {state === "working" && <p className="text-sm text-ink-soft">Accepting your invitation…</p>}
        {state === "done" && (
          <>
            <div className="text-2xl text-signal">✓</div>
            <p className="mt-2 text-ink">You&apos;ve joined the organization. Redirecting…</p>
          </>
        )}
        {state === "needsAuth" && (
          <>
            <p className="text-sm text-ink-soft">Sign in or create an account to accept this invitation.</p>
            <Link href={`/login?next=/invite/${params.token}`} className="mono mt-4 inline-block rounded-lg bg-signal px-4 py-2 text-sm font-semibold text-base-950 hover:bg-signal-bright">
              Sign in to accept
            </Link>
          </>
        )}
        {state === "error" && <p className="mono text-sm text-risk-high">{message}</p>}
      </div>
    </div>
  );
}
