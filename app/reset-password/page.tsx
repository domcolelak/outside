"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { Wordmark } from "@/components/Wordmark";

function ResetPasswordForm() {
  const token = useSearchParams().get("token") ?? "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent" | "reset">("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (token && password !== confirm) return setError("Passwords do not match.");
    setState("busy");
    setError(null);
    try {
      const response = await fetch(token ? "/api/auth/password-reset/confirm" : "/api/auth/password-reset/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(token ? { token, password } : { email }),
      });
      const data = await response.json();
      if (!response.ok) { setError(data.error ?? "The request could not be completed."); setState("idle"); return; }
      setState(token ? "reset" : "sent");
    } catch {
      setError("Network error. Try again.");
      setState("idle");
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4">
      <div className="grid-backdrop pointer-events-none fixed inset-0" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex justify-center"><Link href="/"><Wordmark className="h-7" /></Link></div>
        <section className="panel p-6" aria-labelledby="reset-title">
          <h1 id="reset-title" className="text-xl font-medium text-ink">{token ? "Choose a new password" : "Reset your password"}</h1>
          {state === "sent" ? <p role="status" className="mt-4 text-sm leading-6 text-ink-soft">If the account exists, a single-use reset link is on its way. Check spam and wait a few minutes before requesting another.</p>
          : state === "reset" ? <div role="status" className="mt-4"><p className="text-sm text-signal">Password changed. Existing sessions were revoked.</p><Link href="/login" className="mt-5 inline-block rounded-lg bg-signal px-4 py-2 text-sm font-semibold text-base-950">Sign in</Link></div>
          : <form onSubmit={submit} className="mt-5 space-y-3">
              {token ? <>
                <Field label="New password" type="password" value={password} onChange={setPassword} autoComplete="new-password" placeholder="At least 10 characters" />
                <Field label="Confirm password" type="password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
              </> : <Field label="Account email" type="email" value={email} onChange={setEmail} autoComplete="email" placeholder="you@company.com" />}
              {error && <p role="alert" className="mono text-xs text-risk-high">{error}</p>}
              <button disabled={state === "busy"} className="w-full rounded-lg bg-signal py-2.5 text-sm font-semibold text-base-950 disabled:opacity-60">{state === "busy" ? "Please wait…" : token ? "Change password" : "Send reset link"}</button>
            </form>}
        </section>
        <p className="mt-4 text-center text-xs text-ink-faint"><Link href="/login" className="hover:text-ink">Back to sign in</Link></p>
      </div>
    </main>
  );
}

function Field({ label, value, onChange, ...input }: { label: string; value: string; onChange: (value: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return <label className="block"><span className="mono mb-1 block text-[11px] uppercase tracking-wide text-ink-faint">{label}</span><input {...input} required value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-line bg-base-950 px-3 py-2 text-sm text-ink focus:border-signal/40 focus:outline-hidden"/></label>;
}

export default function ResetPasswordPage() {
  return <Suspense fallback={<div className="grid min-h-screen place-items-center text-sm text-ink-soft">Loading…</div>}><ResetPasswordForm /></Suspense>;
}

