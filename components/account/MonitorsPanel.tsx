"use client";

import { useCallback, useEffect, useState } from "react";
import type { Monitor } from "@/lib/monitoring";

const LIMIT: Record<string, number> = { free: 1, professional: 5, agency: 30 };

export function MonitorsPanel({ orgId, plan }: { orgId: string; plan: string }) {
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [domain, setDomain] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "weekly">("daily");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const limit = LIMIT[plan] ?? 1;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/monitors?orgId=${orgId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load monitored targets.");
      setMonitors(data.monitors ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load monitored targets.");
    } finally {
      setLoading(false);
    }
  }, [orgId]);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/monitors", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orgId, domain, frequency }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not add monitor.");
      setDomain("");
      setMonitors((m) => [data.monitor, ...m]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add monitor.");
    } finally {
      setSubmitting(false);
    }
  };

  const toggle = async (m: Monitor) => {
    setUpdatingId(m.id);
    setError(null);
    try {
      const res = await fetch(`/api/monitors/${m.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ orgId, enabled: !m.enabled }) });
      if (!res.ok) {
        const data = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error ?? "Could not update monitor.");
      }
      setMonitors((list) => list.map((x) => (x.id === m.id ? { ...x, enabled: !x.enabled } : x)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update monitor.");
    } finally {
      setUpdatingId(null);
    }
  };

  const remove = async (m: Monitor) => {
    setUpdatingId(m.id);
    setError(null);
    try {
      const res = await fetch(`/api/monitors/${m.id}?orgId=${orgId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error ?? "Could not remove monitor.");
      }
      setMonitors((list) => list.filter((x) => x.id !== m.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove monitor.");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <section>
      <div className="mono mb-3 flex items-center justify-between text-[12px] uppercase tracking-wider text-ink-faint">
        <span>Monitored targets</span>
        <span>{monitors.length} / {limit}</span>
      </div>

      <form onSubmit={add} className="panel mb-3 flex flex-wrap items-center gap-2 p-2">
        <input
          aria-label="Domain to monitor"
          aria-describedby={error ? "monitor-error" : undefined}
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="company.com"
          required
          className="mono min-w-0 flex-1 bg-transparent px-2 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-hidden"
        />
        <select aria-label="Monitoring frequency" value={frequency} onChange={(e) => setFrequency(e.target.value as "daily" | "weekly")} className="mono rounded-md border border-line bg-base-950 px-2 py-2 text-xs text-ink-soft">
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>
        <button type="submit" disabled={submitting} className="rounded-lg bg-signal px-4 py-2 text-sm font-semibold text-base-950 hover:bg-signal-bright disabled:opacity-60">{submitting ? "Adding…" : "Monitor"}</button>
      </form>
      {error && <div id="monitor-error" role="alert" className="mono mb-3 flex items-center justify-between gap-3 text-xs text-risk-high"><span>{error}</span>{!loading && monitors.length === 0 && <button type="button" onClick={() => void load()} className="rounded-md border border-line px-2 py-1 text-ink-soft hover:text-ink">Retry</button>}</div>}

      <div className="space-y-2">
        {loading && <div className="mono text-xs text-ink-faint">Loading…</div>}
        {!loading && monitors.length === 0 && (
          <div className="panel px-4 py-6 text-center text-xs text-ink-faint">
            No monitored targets yet. Add a domain to track its external surface over time and get change alerts.
          </div>
        )}
        {monitors.map((m) => (
          <div key={m.id} className="panel flex items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <div className="mono truncate text-sm text-ink">{m.domain}</div>
              <div className="mono mt-0.5 text-[12px] text-ink-faint">
                {m.frequency} · {m.lastScanAt ? `last scan ${new Date(m.lastScanAt).toLocaleDateString()}` : "not scanned yet"}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => void toggle(m)}
                aria-pressed={m.enabled}
                disabled={updatingId === m.id}
                className={`mono rounded-md border px-2 py-1 text-[12px] ${m.enabled ? "border-signal/30 text-signal" : "border-line text-ink-faint"}`}
              >
                {m.enabled ? "Enabled" : "Paused"}
              </button>
              <button onClick={() => void remove(m)} disabled={updatingId === m.id} className="mono rounded-md border border-line px-2 py-1 text-[12px] text-ink-soft hover:border-risk-high/40 hover:text-risk-high disabled:opacity-50">Remove</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
