"use client";

import { useCallback, useEffect, useState } from "react";

interface Subscription { subscriptionName: string; domainSearchMaxBreachedAccounts: number | null; subscribedUntil: string | null }
interface DomainSearch { available: boolean; hibpVerifiedDomains: string[]; error?: string }
interface Status {
  stored: boolean;
  connected: boolean;
  accountHint?: string;
  connectedAt?: string;
  subscription?: Subscription;
  domainSearch?: DomainSearch;
  error?: { code: string; message: string };
}

/**
 * Have I Been Pwned — bring your own key. A stored key is only shown as
 * "Connected" after a live server-side test; the key is entered once, masked
 * thereafter, and never returned to the browser.
 */
export function HibpConnector({ orgId }: { orgId: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState<"" | "load" | "save" | "test" | "delete">("load");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy("load");
    try {
      const res = await fetch(`/api/integrations/hibp?orgId=${encodeURIComponent(orgId)}`, { credentials: "include" });
      if (res.ok) setStatus(await res.json());
    } catch { /* keep prior state */ }
    setBusy("");
  }, [orgId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function connect() {
    if (busy) return;
    setBusy("save");
    setError(null);
    try {
      const res = await fetch("/api/integrations/hibp", {
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
      const res = await fetch(`/api/integrations/hibp?orgId=${encodeURIComponent(orgId)}`, { method: "DELETE", credentials: "include" });
      if (res.ok) { setStatus({ stored: false, connected: false }); setEditing(false); }
    } catch { /* leave as-is */ }
    setBusy("");
  }

  const showForm = editing || (status && !status.stored);

  return (
    <div className="panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-ink">Have I Been Pwned</div>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">Breach exposure for domains you have verified. Bring your own HIBP API key — used server-side only.</p>
        </div>
        <span className={`mono shrink-0 rounded-md border px-2 py-0.5 text-[11px] uppercase tracking-wide ${status?.connected ? "border-signal/30 bg-signal/10 text-signal" : status?.stored ? "border-risk-medium/40 text-risk-medium" : "border-line text-ink-faint"}`}>
          {busy === "load" ? "Checking…" : status?.connected ? "Connected" : status?.stored ? "Attention" : "Not connected"}
        </span>
      </div>

      {status?.stored && !showForm && (
        <div className="mt-3 space-y-2">
          <div className="mono flex flex-wrap items-center gap-x-3 text-[11px] text-ink-faint">
            <span>Key {status.accountHint}</span>
            {status.connected && status.subscription && <span className="text-ink-soft">{status.subscription.subscriptionName}</span>}
          </div>
          {status.connected ? (
            <div className="mono text-[11px] text-ink-faint">
              Domain search:{" "}
              {status.domainSearch?.available
                ? <span className="text-signal">available for {status.domainSearch.hibpVerifiedDomains.length} HIBP-verified domain{status.domainSearch.hibpVerifiedDomains.length === 1 ? "" : "s"}</span>
                : <span className="text-risk-medium">no HIBP-verified domains — add and verify your domain in HIBP to enable it</span>}
            </div>
          ) : (
            <div className="mono rounded-md border border-risk-medium/30 bg-risk-medium/5 px-2 py-1 text-[11px] text-risk-medium">
              {status.error?.message ?? "The stored key did not pass a live check."}
            </div>
          )}
          {status.connected && status.domainSearch?.hibpVerifiedDomains?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {status.domainSearch.hibpVerifiedDomains.map((domain) => (
                <span key={domain} className="mono rounded-sm border border-line px-1.5 py-0.5 text-[11px] text-ink-soft">{domain}</span>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button onClick={() => void load()} disabled={!!busy} className="mono rounded-md border border-line px-2.5 py-1 text-[11px] text-ink-soft hover:text-ink disabled:opacity-50">Test connection</button>
            <button onClick={() => { setEditing(true); setError(null); }} disabled={!!busy} className="mono rounded-md border border-line px-2.5 py-1 text-[11px] text-ink-soft hover:text-ink disabled:opacity-50">Replace key</button>
            <button onClick={disconnect} disabled={!!busy} className="mono rounded-md border border-line px-2.5 py-1 text-[11px] text-ink-soft hover:text-ink disabled:opacity-50">{busy === "delete" ? "Disconnecting…" : "Disconnect"}</button>
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={(e) => { e.preventDefault(); void connect(); }} className="mt-3 rounded-lg border border-line bg-base-950/60 p-3">
          <label htmlFor="hibp-key" className="mono block text-[11px] uppercase tracking-wide text-ink-faint">HIBP API key</label>
          <input id="hibp-key" type="password" value={key} onChange={(e) => { setKey(e.target.value); setError(null); }} placeholder="32-character key" autoComplete="off" spellCheck={false} className="mono mt-1.5 w-full rounded-md border border-line bg-base-900 px-2.5 py-2 text-[12px] text-ink placeholder:text-ink-faint focus:outline-hidden" />
          <p className="mono mt-2 text-[11px] leading-5 text-ink-faint">Get a key at <span className="text-ink-soft">haveibeenpwned.com/API/Key</span>. We verify it with HIBP, store it encrypted, and never show it again.</p>
          {error && <p role="alert" className="mono mt-2 text-[11px] text-risk-high">{error}</p>}
          <div className="mt-3 flex items-center gap-2">
            <button type="submit" disabled={!!busy || key.trim().length === 0} className="mono rounded-md border border-signal/40 bg-signal/10 px-3 py-1.5 text-[11px] text-signal hover:bg-signal/15 disabled:opacity-50">{busy === "save" ? "Verifying with HIBP…" : "Connect"}</button>
            {status?.stored && <button type="button" onClick={() => { setEditing(false); setKey(""); setError(null); }} className="mono rounded-md border border-line px-2.5 py-1.5 text-[11px] text-ink-soft hover:text-ink">Cancel</button>}
          </div>
        </form>
      )}
    </div>
  );
}
