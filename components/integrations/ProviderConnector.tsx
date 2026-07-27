"use client";

import { useCallback, useEffect, useState } from "react";

export interface ProviderDescriptor {
  id: string;
  name: string;
  summary: string;
  docsUrl: string;
  keyPlaceholder: string;
  blocked?: { reason: string };
}

interface Capability { id: string; label: string; available: boolean; detail?: string }
interface Usage { total: number; failures: number; lastUsedAt?: string; lastErrorCode?: string }
interface Status {
  stored: boolean;
  connected: boolean;
  accountHint?: string;
  accountLabel?: string;
  connectedAt?: string;
  capabilities?: Capability[];
  usage?: Usage;
  blocked?: { reason: string };
  error?: { code: string; message: string; retryAfterSeconds?: number };
}

/**
 * One connector UI for every BYOK provider. Driven entirely by the descriptor
 * and the live status from /api/integrations/<id>. A stored key is only shown
 * "Connected" after a live server-side validation; the key is entered once,
 * masked thereafter, and never returned to the browser.
 */
export function ProviderConnector({ descriptor, orgId }: { descriptor: ProviderDescriptor; orgId: string }) {
  const [status, setStatus] = useState<Status | null>(descriptor.blocked ? { stored: false, connected: false, blocked: descriptor.blocked } : null);
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState<"" | "load" | "save" | "delete">(descriptor.blocked ? "" : "load");
  const [error, setError] = useState<string | null>(null);
  const api = `/api/integrations/${encodeURIComponent(descriptor.id)}`;

  const load = useCallback(async () => {
    setBusy("load");
    try {
      const res = await fetch(`${api}?orgId=${encodeURIComponent(orgId)}`, { credentials: "include" });
      if (res.ok) setStatus(await res.json());
    } catch { /* keep prior state */ }
    setBusy("");
  }, [api, orgId]);

  useEffect(() => {
    if (descriptor.blocked) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load, descriptor.blocked]);

  async function connect() {
    if (busy) return;
    setBusy("save");
    setError(null);
    try {
      const res = await fetch(api, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ orgId, key: key.trim() }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Could not connect.");
      else { setStatus(data); setKey(""); setEditing(false); }
    } catch {
      setError("Network error. Nothing was saved.");
    }
    setBusy("");
  }

  async function disconnect() {
    if (busy) return;
    setBusy("delete");
    try {
      const res = await fetch(`${api}?orgId=${encodeURIComponent(orgId)}`, { method: "DELETE", credentials: "include" });
      if (res.ok) setStatus(await res.json());
    } catch { /* leave as-is */ }
    setBusy("");
  }

  const blocked = status?.blocked ?? descriptor.blocked;
  const showForm = !blocked && (editing || (status != null && !status.stored));
  const badge = busy === "load" ? "Checking…" : blocked ? "Unavailable" : status?.connected ? "Connected" : status?.stored ? "Attention" : "Not connected";
  const badgeClass = blocked
    ? "border-line text-ink-faint"
    : status?.connected
      ? "border-signal/30 bg-signal/10 text-signal"
      : status?.stored
        ? "border-risk-medium/40 text-risk-medium"
        : "border-line text-ink-faint";

  return (
    <div className="panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-ink">{descriptor.name}</div>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">{descriptor.summary}</p>
        </div>
        <span className={`mono shrink-0 rounded-md border px-2 py-0.5 text-[11px] uppercase tracking-wide ${badgeClass}`}>{badge}</span>
      </div>

      {blocked && (
        <div className="mono mt-3 rounded-md border border-line bg-base-900 px-2.5 py-2 text-[11px] leading-5 text-ink-faint">{blocked.reason}</div>
      )}

      {!blocked && status?.stored && !showForm && (
        <div className="mt-3 space-y-2">
          <div className="mono flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-faint">
            <span>Key {status.accountHint}</span>
            {status.connected && status.accountLabel && <span className="text-ink-soft">{status.accountLabel}</span>}
          </div>

          {status.connected && status.capabilities?.length ? (
            <ul className="space-y-1">
              {status.capabilities.map((cap) => (
                <li key={cap.id} className="mono text-[11px] text-ink-faint">
                  {cap.label}:{" "}
                  {cap.available
                    ? <span className="text-signal">available{cap.detail ? ` — ${cap.detail}` : ""}</span>
                    : <span className="text-risk-medium">{cap.detail ?? "not available"}</span>}
                </li>
              ))}
            </ul>
          ) : null}

          {!status.connected && (
            <div className="mono rounded-md border border-risk-medium/30 bg-risk-medium/5 px-2 py-1 text-[11px] text-risk-medium">
              {status.error?.message ?? "The stored key did not pass a live check."}
            </div>
          )}

          {status.usage && status.usage.total > 0 && (
            <div className="mono text-[11px] text-ink-faint">
              Usage: {status.usage.total} call{status.usage.total === 1 ? "" : "s"}
              {status.usage.failures > 0 && <span className="text-risk-medium"> · {status.usage.failures} failed</span>}
              {status.usage.lastUsedAt && <span> · last {new Date(status.usage.lastUsedAt).toLocaleString()}</span>}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button onClick={() => void load()} disabled={!!busy} className="mono rounded-md border border-line px-2.5 py-1 text-[11px] text-ink-soft hover:text-ink disabled:opacity-50">Test connection</button>
            <button onClick={() => { setEditing(true); setError(null); }} disabled={!!busy} className="mono rounded-md border border-line px-2.5 py-1 text-[11px] text-ink-soft hover:text-ink disabled:opacity-50">Replace key</button>
            <button onClick={disconnect} disabled={!!busy} className="mono rounded-md border border-line px-2.5 py-1 text-[11px] text-ink-soft hover:text-ink disabled:opacity-50">{busy === "delete" ? "Disconnecting…" : "Disconnect"}</button>
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={(e) => { e.preventDefault(); void connect(); }} className="mt-3 rounded-lg border border-line bg-base-950/60 p-3">
          <label htmlFor={`key-${descriptor.id}`} className="mono block text-[11px] uppercase tracking-wide text-ink-faint">API key</label>
          <input id={`key-${descriptor.id}`} type="password" value={key} onChange={(e) => { setKey(e.target.value); setError(null); }} placeholder={descriptor.keyPlaceholder} autoComplete="off" spellCheck={false} className="mono mt-1.5 w-full rounded-md border border-line bg-base-900 px-2.5 py-2 text-[12px] text-ink placeholder:text-ink-faint focus:outline-hidden" />
          <p className="mono mt-2 text-[11px] leading-5 text-ink-faint">Get a key at <a href={descriptor.docsUrl} target="_blank" rel="noreferrer noopener" className="text-ink-soft underline hover:text-ink">{descriptor.docsUrl.replace(/^https?:\/\//, "")}</a>. We verify it, store it encrypted, and never show it again.</p>
          {error && <p role="alert" className="mono mt-2 text-[11px] text-risk-high">{error}</p>}
          <div className="mt-3 flex items-center gap-2">
            <button type="submit" disabled={!!busy || key.trim().length === 0} className="mono rounded-md border border-signal/40 bg-signal/10 px-3 py-1.5 text-[11px] text-signal hover:bg-signal/15 disabled:opacity-50">{busy === "save" ? "Verifying…" : "Connect"}</button>
            {status?.stored && <button type="button" onClick={() => { setEditing(false); setKey(""); setError(null); }} className="mono rounded-md border border-line px-2.5 py-1.5 text-[11px] text-ink-soft hover:text-ink">Cancel</button>}
          </div>
        </form>
      )}
    </div>
  );
}
