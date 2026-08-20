"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslator } from "@/lib/i18n/context";

export function AgencyOnboarding({
  organizations,
}: {
  organizations: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const tr = useTranslator();
  const g = (key: Parameters<typeof tr.t<"agency">>[1]) => tr.t("agency", key);
  const [name, setName] = useState(organizations[0]?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/agency", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ownerOrgId: organizations[0]?.id, name, slug: name }),
      });
      if (!response.ok) {
        setError(g("onboardingCreateFailed"));
        return;
      }
      router.refresh();
    } catch {
      setError(g("onboardingCreateFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel relative overflow-hidden p-8 md:p-12">
      <div className="grid-backdrop pointer-events-none absolute inset-0 opacity-40" />
      <div className="relative max-w-2xl">
        <div className="mono text-[11px] uppercase tracking-[.2em] text-signal">{g("onboardingKicker")}</div>
        <h1 className="mt-4 text-4xl font-semibold text-gradient">{g("onboardingTitle")}</h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-ink-soft">{g("onboardingDescription")}</p>
        {organizations.length ? (
          <div className="mt-8 flex max-w-lg gap-3">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-label={g("onboardingNameLabel")}
              className="min-w-0 flex-1 rounded-lg border border-line bg-base-950 px-4 py-3 text-sm outline-hidden focus:border-signal/50"
            />
            <button disabled={busy} onClick={create} className="rounded-lg bg-signal px-5 py-3 text-sm font-semibold text-base-950 disabled:opacity-50">
              {busy ? g("onboardingCreating") : g("onboardingCreate")}
            </button>
          </div>
        ) : (
          <p className="mt-8 text-risk-high">{g("onboardingPlanRequired")}</p>
        )}
        {error && <p className="mono mt-3 text-xs text-risk-high">{error}</p>}
      </div>
    </section>
  );
}
