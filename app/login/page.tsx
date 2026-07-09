"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Wordmark } from "@/components/Wordmark";

function AuthForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"login" | "signup">(params.get("mode") === "signup" ? "signup" : "login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const endpoint = mode === "signup" ? "/api/auth/signup" : "/api/auth/login";
    const body = mode === "signup" ? { email, name, password } : { email, password };
    try {
      const res = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        setBusy(false);
        return;
      }
      router.push("/account");
      router.refresh();
    } catch {
      setError("Network error. Try again.");
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 flex justify-center">
        <Link href="/"><Wordmark className="h-7" /></Link>
      </div>
      <div className="panel p-6">
        <div className="mb-5 flex rounded-lg border border-line p-1 text-sm">
          {(["login", "signup"] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(null); }}
              className={`flex-1 rounded-md py-1.5 transition ${mode === m ? "bg-base-700 text-ink" : "text-ink-faint hover:text-ink-soft"}`}
            >
              {m === "login" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === "signup" && (
            <Input label="Name" value={name} onChange={setName} placeholder="Alex Rivera" autoComplete="name" />
          )}
          <Input label="Email" value={email} onChange={setEmail} placeholder="you@company.com" type="email" autoComplete="email" />
          <Input label="Password" value={password} onChange={setPassword} placeholder={mode === "signup" ? "At least 10 characters" : "••••••••"} type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} />

          {error && <p className="mono text-xs text-risk-high">{error}</p>}

          <button type="submit" disabled={busy} className="w-full rounded-lg bg-signal py-2.5 text-sm font-semibold text-base-950 transition hover:bg-signal-bright disabled:opacity-60">
            {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>
      </div>
      <p className="mono mt-4 text-center text-[11px] text-ink-faint">
        An external snapshot needs no account. Sign in to monitor targets and verify ownership.
      </p>
    </div>
  );
}

function Input({ label, value, onChange, ...rest }: { label: string; value: string; onChange: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) {
  return (
    <label className="block">
      <span className="mono mb-1 block text-[10px] uppercase tracking-wide text-ink-faint">{label}</span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-line bg-base-950 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-signal/40 focus:outline-none"
      />
    </label>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="grid-backdrop pointer-events-none fixed inset-0" />
      <div className="relative">
        <Suspense fallback={<div className="text-ink-soft">Loading…</div>}>
          <AuthForm />
        </Suspense>
      </div>
    </div>
  );
}
