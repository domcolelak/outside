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
  const limit = LIMIT[plan] ?? 1;

  const load = useCallback(async () => {
    const res = await fetch(`/api/monitors?orgId=${orgId}`);
    const data = await res.json();
    setMonitors(data.monitors ?? []);
    setLoading(false);
  }, [orgId]);
  useEffect(() => {
    void load();
  }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/monitors", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orgId, domain, frequency }) });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not add monitor.");
      return;
    }
    setDomain("");
    setMonitors((m) => [data.monitor, ...m]);
  };

  const toggle = async (m: Monitor) => {
    const res = await fetch(`/api/monitors/${m.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ orgId, enabled: !m.enabled }) });
    if (res.ok) setMonitors((list) => list.map((x) => (x.id === m.id ? { ...x, enabled: !x.enabled } : x)));
  };

  const remove = async (m: Monitor) => {
    const res = await fetch(`/api/monitors/${m.id}?orgId=${orgId}`, { method: "DELETE" });
    if (res.ok) setMonitors((list) => list.filter((x) => x.id !== m.id));
    else setError((await res.json()).error ?? "Could not remove.");
  };

  return (
    <section>
      <div className="mono mb-3 flex items-center justify-between text-[11px] uppercase tracking-wider text-ink-faint">
        <span>Monitored targets</span>
        <span>{monitors.length} / {limit}</span>
      </div>

      <form onSubmit={add} className="panel mb-3 flex flex-wrap items-center gap-2 p-2">
        <input
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="company.com"
          className="mono min-w-0 flex-1 bg-transparent px-2 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none"
        />
        <select value={frequency} onChange={(e) => setFrequency(e.target.value as "daily" | "weekly")} className="mono rounded-md border border-line bg-base-950 px-2 py-2 text-xs text-ink-soft">
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>
        <button type="submit" className="rounded-lg bg-signal px-4 py-2 text-sm font-semibold text-base-950 hover:bg-signal-bright">Monitor</button>
      </form>
      {error && <p className="mono mb-3 text-xs text-risk-high">{error}</p>}

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
              <div className="mono mt-0.5 text-[11px] text-ink-faint">
                {m.frequency} · {m.lastScanAt ? `last scan ${new Date(m.lastScanAt).toLocaleDateString()}` : "not scanned yet"}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => toggle(m)}
                className={`mono rounded-md border px-2 py-1 text-[11px] ${m.enabled ? "border-signal/30 text-signal" : "border-line text-ink-faint"}`}
              >
                {m.enabled ? "Enabled" : "Paused"}
              </button>
              <button onClick={() => remove(m)} className="mono rounded-md border border-line px-2 py-1 text-[11px] text-ink-soft hover:border-risk-high/40 hover:text-risk-high">Remove</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
