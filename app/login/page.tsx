"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Wordmark } from "@/components/Wordmark";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useTranslator } from "@/lib/i18n/context";
import { authErrorMessage } from "@/lib/auth/error-keys";
import { trackFunnel } from "@/lib/analytics/client";
import type { MessageKey } from "@/lib/i18n/messages";

function AuthForm() {
  const router = useRouter();
  const params = useSearchParams();
  const t = useTranslator();
  const a = (key: MessageKey<"auth">) => t.t("auth", key);
  const [mode, setMode] = useState<"login" | "signup">(params.get("mode") === "signup" ? "signup" : "login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(params.get("error") ? a("errorSignInFailed") : null);
  const [busy, setBusy] = useState(false);
  const [googleOn, setGoogleOn] = useState(false);

  useEffect(() => {
    fetch("/api/auth/providers").then((r) => r.json()).then((d) => setGoogleOn(!!d.google)).catch(() => {});
    // Already signed in? Don't show a login form — it reads as a sign-out.
    fetch("/api/auth/me").then((r) => r.json()).then((d) => {
      if (d.authenticated) {
        const next = params.get("next");
        router.push(next && next.startsWith("/") ? next : "/account");
      }
    }).catch(() => {});
  }, [params, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "signup") trackFunnel("signup_started");
    setBusy(true);
    setError(null);
    const endpoint = mode === "signup" ? "/api/auth/signup" : "/api/auth/login";
    const body = mode === "signup" ? { email, name, password } : { email, password };
    try {
      const res = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) {
        setError(authErrorMessage(data, a));
        setBusy(false);
        return;
      }
      if (mode === "signup") trackFunnel("signup_completed");
      const next = params.get("next");
      router.push(next && next.startsWith("/") ? next : "/account");
      router.refresh();
    } catch {
      setError(a("errorNetwork"));
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 flex flex-col items-center gap-4">
        <Link href="/"><Wordmark className="h-7" /></Link>
        {/* Someone who reached sign-in in the wrong language must be able to
            change it here, not only from the landing page. */}
        <LanguageSwitcher current={t.locale} label={t.t("common", "changeLanguage")} />
      </div>
      <div className="panel p-6">
        <div className="mb-5 flex rounded-lg border border-line p-1 text-sm">
          {(["login", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-label={m === "login" ? a("switchToSignIn") : a("switchToCreateAccount")}
              aria-pressed={mode === m}
              onClick={() => { setMode(m); setError(null); }}
              className={`flex-1 rounded-md py-1.5 transition ${mode === m ? "bg-base-700 text-ink" : "text-ink-faint hover:text-ink-soft"}`}
            >
              {m === "login" ? a("signIn") : a("createAccount")}
            </button>
          ))}
        </div>

        {googleOn && (
          <>
            <a
              href="/api/auth/oauth/google"
              className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-base-850 py-2.5 text-sm text-ink transition hover:bg-base-700"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.2 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"/></svg>
              {a("continueWithGoogle")}
            </a>
            <div className="mb-4 flex items-center gap-3 text-[12px] text-ink-faint">
              <span className="h-px flex-1 bg-line" /> {a("or")} <span className="h-px flex-1 bg-line" />
            </div>
          </>
        )}
        <form onSubmit={submit} className="space-y-3">
          {mode === "signup" && (
            <Input label={a("name")} value={name} onChange={setName} placeholder={a("namePlaceholder")} autoComplete="name" />
          )}
          <Input label={a("email")} value={email} onChange={setEmail} placeholder={a("emailPlaceholder")} type="email" autoComplete="email" />
          <Input label={a("password")} value={password} onChange={setPassword} placeholder={mode === "signup" ? a("passwordPlaceholderNew") : "••••••••"} type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} />
          {mode === "login" && <div className="text-right"><Link href="/reset-password" className="text-xs text-ink-faint hover:text-signal">{a("forgotPassword")}</Link></div>}

          {error && <p role="alert" className="mono text-xs text-risk-high">{error}</p>}

          <button type="submit" disabled={busy} className="w-full rounded-lg bg-signal py-2.5 text-sm font-semibold text-base-950 transition hover:bg-signal-bright disabled:opacity-60">
            {busy ? a("pleaseWait") : mode === "signup" ? a("createAccount") : a("signIn")}
          </button>
        </form>
      </div>
      <p className="mono mt-4 text-center text-[12px] text-ink-faint">
        {a("noAccountNeeded")}
      </p>
    </div>
  );
}

function Input({ label, value, onChange, ...rest }: { label: string; value: string; onChange: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) {
  return (
    <label className="block">
      <span className="mono mb-1 block text-[11px] uppercase tracking-wide text-ink-faint">{label}</span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-line bg-base-950 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-signal/40 focus:outline-hidden"
      />
    </label>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="grid-backdrop pointer-events-none fixed inset-0" />
      <div className="relative">
        {/* Rendered before the client bundle resolves the query string, so it
            cannot read the locale provider — hence a mark rather than a word. */}
        <Suspense fallback={<div className="text-ink-soft">…</div>}>
          <AuthForm />
        </Suspense>
      </div>
    </div>
  );
}
