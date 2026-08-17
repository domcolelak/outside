"use client";

import { useState } from "react";
import { useTranslator } from "@/lib/i18n/context";
import { trackProductEvent } from "@/lib/analytics/client";

export function CheckoutButton({ orgId, plan, current, label }: { orgId: string; plan: string; current: boolean; label: string }) {
  const t = useTranslator();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orgId, plan }) });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? t.t("billing", "checkoutUnavailable"));
      trackProductEvent("checkout_started", { plan });
      window.location.href = data.url;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  if (current) {
    return <div className="mono rounded-lg border border-signal/30 bg-signal/10 py-2 text-center text-xs text-signal">{t.t("billing", "currentPlan")}</div>;
  }
  return (
    <div>
      <button onClick={go} disabled={busy} className="w-full rounded-lg bg-signal py-2 text-sm font-semibold text-base-950 hover:bg-signal-bright disabled:opacity-60">
        {busy ? t.t("billing", "redirecting") : label}
      </button>
      {error && <p className="mono mt-1 text-[12px] text-risk-high">{error}</p>}
    </div>
  );
}

export function ManageBillingButton({ orgId }: { orgId: string }) {
  const t = useTranslator();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orgId }) });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? t.t("billing", "portalUnavailable"));
      window.location.href = data.url;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <div>
      <button onClick={go} disabled={busy} className="mono rounded-md border border-line px-3 py-1.5 text-xs text-ink-soft hover:bg-base-700 disabled:opacity-60">
        {busy ? t.t("billing", "opening") : t.t("billing", "manageBilling")}
      </button>
      {error && <p className="mono mt-1 text-[12px] text-risk-high">{error}</p>}
    </div>
  );
}
