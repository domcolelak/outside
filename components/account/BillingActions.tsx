"use client";

import { useState } from "react";

export function CheckoutButton({ orgId, plan, current, label }: { orgId: string; plan: string; current: boolean; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orgId, plan }) });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? "Checkout unavailable");
      window.location.href = data.url;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  if (current) {
    return <div className="mono rounded-lg border border-signal/30 bg-signal/10 py-2 text-center text-xs text-signal">Current plan</div>;
  }
  return (
    <div>
      <button onClick={go} disabled={busy} className="w-full rounded-lg bg-signal py-2 text-sm font-semibold text-base-950 hover:bg-signal-bright disabled:opacity-60">
        {busy ? "Redirecting…" : label}
      </button>
      {error && <p className="mono mt-1 text-[11px] text-risk-high">{error}</p>}
    </div>
  );
}

export function ManageBillingButton({ orgId }: { orgId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orgId }) });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? "Portal unavailable");
      window.location.href = data.url;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <div>
      <button onClick={go} disabled={busy} className="mono rounded-md border border-line px-3 py-1.5 text-xs text-ink-soft hover:bg-base-700 disabled:opacity-60">
        {busy ? "Opening…" : "Manage billing"}
      </button>
      {error && <p className="mono mt-1 text-[11px] text-risk-high">{error}</p>}
    </div>
  );
}
