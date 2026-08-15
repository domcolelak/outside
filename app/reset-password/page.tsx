"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { Wordmark } from "@/components/Wordmark";
import { useTranslator } from "@/lib/i18n/context";
import { authErrorMessage } from "@/lib/auth/error-keys";
import type { MessageKey } from "@/lib/i18n/messages";

function ResetPasswordForm() {
  const token = useSearchParams().get("token") ?? "";
  const t = useTranslator();
  const a = (key: MessageKey<"auth">) => t.t("auth", key);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent" | "reset">("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (token && password !== confirm) return setError(a("resetMismatch"));
    setState("busy");
    setError(null);
    try {
      const response = await fetch(token ? "/api/auth/password-reset/confirm" : "/api/auth/password-reset/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(token ? { token, password } : { email }),
      });
      const data = await response.json();
      // Translated by code, with the server's English as the fallback — the
      // same contract sign-in uses, from the same shared map.
      if (!response.ok) { setError(authErrorMessage(data, a)); setState("idle"); return; }
      setState(token ? "reset" : "sent");
    } catch {
      setError(a("errorNetwork"));
      setState("idle");
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4">
      <div className="grid-backdrop pointer-events-none fixed inset-0" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex justify-center"><Link href="/"><Wordmark className="h-7" /></Link></div>
        <section className="panel p-6" aria-labelledby="reset-title">
          <h1 id="reset-title" className="text-xl font-medium text-ink">{token ? a("resetChooseTitle") : a("resetTitle")}</h1>
          {state === "sent" ? <p role="status" className="mt-4 text-sm leading-6 text-ink-soft">{a("resetSent")}</p>
          : state === "reset" ? <div role="status" className="mt-4"><p className="text-sm text-signal">{a("resetDone")}</p><Link href="/login" className="mt-5 inline-block rounded-lg bg-signal px-4 py-2 text-sm font-semibold text-base-950">{a("signIn")}</Link></div>
          : <form onSubmit={submit} className="mt-5 space-y-3">
              {token ? <>
                <Field label={a("resetNewPassword")} type="password" value={password} onChange={setPassword} autoComplete="new-password" placeholder={a("resetNewPasswordPlaceholder")} />
                <Field label={a("resetConfirmPassword")} type="password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
              </> : <Field label={a("resetAccountEmail")} type="email" value={email} onChange={setEmail} autoComplete="email" placeholder={a("emailPlaceholder")} />}
              {error && <p role="alert" className="mono text-xs text-risk-high">{error}</p>}
              <button disabled={state === "busy"} className="w-full rounded-lg bg-signal py-2.5 text-sm font-semibold text-base-950 disabled:opacity-60">{state === "busy" ? a("pleaseWait") : token ? a("resetSubmitChange") : a("resetSubmitRequest")}</button>
            </form>}
        </section>
        <p className="mt-4 text-center text-xs text-ink-faint"><Link href="/login" className="hover:text-ink">{a("resetBackToSignIn")}</Link></p>
      </div>
    </main>
  );
}

function Field({ label, value, onChange, ...input }: { label: string; value: string; onChange: (value: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return <label className="block"><span className="mono mb-1 block text-[11px] uppercase tracking-wide text-ink-faint">{label}</span><input {...input} required value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-line bg-base-950 px-3 py-2 text-sm text-ink focus:border-signal/40 focus:outline-hidden"/></label>;
}

function ResetFallback() {
  // Rendered before the client bundle resolves the query string, so it cannot
  // read the provider — the one place in this file English is unavoidable.
  return <div className="grid min-h-screen place-items-center text-sm text-ink-soft">…</div>;
}

export default function ResetPasswordPage() {
  return <Suspense fallback={<ResetFallback />}><ResetPasswordForm /></Suspense>;
}
