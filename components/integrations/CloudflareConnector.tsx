"use client";

import { useCallback, useEffect, useState } from "react";

interface Zone {
  id: string;
  name: string;
}
interface Connection {
  accountHint: string;
  zones: Zone[];
  connectedAt: string;
}

/**
 * Connect a customer's own Cloudflare account. The token is sent once, verified
 * server-side against Cloudflare, then stored encrypted — it is never returned
 * to the browser again, so the connected state only ever shows a hint and the
 * zones the token can act on.
 */
export function CloudflareConnector({ orgId, orgName }: { orgId: string; orgName: string }) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/integrations/cloudflare?orgId=${encodeURIComponent(orgId)}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setConnection(data.connection ?? null);
      }
    } catch {
      /* leave the panel in its disconnected state */
    }
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    // Deferred so the effect body never calls setState synchronously. A timeout
    // rather than requestAnimationFrame: rAF does not fire in a background tab,
    // which would leave this stuck on "Checking connection…" forever.
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function connect(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations/cloudflare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ orgId, token }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Could not connect.");
      else {
        setConnection(data.connection);
        setToken("");
      }
    } catch {
      setError("Network error. Try again.");
    }
    setBusy(false);
  }

  async function disconnect() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/integrations/cloudflare?orgId=${encodeURIComponent(orgId)}`, { method: "DELETE", credentials: "include" });
      if (res.ok) setConnection(null);
      else setError("Could not disconnect.");
    } catch {
      setError("Network error. Try again.");
    }
    setBusy(false);
  }

  if (loading) return <div className="mono mt-3 text-[11px] text-ink-faint">Checking connection…</div>;

  if (connection) {
    return (
      <div className="mt-3 rounded-lg border border-signal/30 bg-signal/5 p-3">
        <div className="mono flex flex-wrap items-center gap-x-2 text-[11px] text-signal">
          <span>✓ Connected for {orgName}</span>
          <span className="text-ink-faint">· {connection.accountHint}</span>
        </div>
        <div className="mono mt-2 text-[11px] text-ink-faint">
          {connection.zones.length} zone{connection.zones.length === 1 ? "" : "s"} this token can act on:
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {connection.zones.map((zone) => (
            <span key={zone.id} className="mono rounded-sm border border-line px-1.5 py-0.5 text-[11px] text-ink-soft">{zone.name}</span>
          ))}
        </div>
        {error && <p role="alert" className="mono mt-2 text-[11px] text-risk-high">{error}</p>}
        <button onClick={disconnect} disabled={busy} className="mono mt-3 rounded-md border border-line px-2.5 py-1 text-[11px] text-ink-soft hover:text-ink disabled:opacity-50">
          {busy ? "Disconnecting…" : "Disconnect"}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={connect} className="mt-3 rounded-lg border border-line bg-base-950/60 p-3">
      <label htmlFor="cf-token" className="mono block text-[11px] uppercase tracking-wide text-ink-faint">
        Cloudflare API token
      </label>
      <input
        id="cf-token"
        type="password"
        value={token}
        onChange={(event) => { setToken(event.target.value); setError(null); }}
        placeholder="Paste your token"
        autoComplete="off"
        spellCheck={false}
        className="mono mt-1.5 w-full rounded-md border border-line bg-base-900 px-2.5 py-2 text-[12px] text-ink placeholder:text-ink-faint focus:outline-hidden"
      />
      <p className="mono mt-2 text-[11px] leading-5 text-ink-faint">
        Create it in Cloudflare under <span className="text-ink-soft">My Profile → API Tokens</span> with{" "}
        <span className="text-ink-soft">Zone:Read</span> and <span className="text-ink-soft">DNS:Edit</span> on the zones you want OUTSIDE to manage.
        We verify it, store it encrypted, and never show it again.
      </p>
      {error && <p role="alert" className="mono mt-2 text-[11px] text-risk-high">{error}</p>}
      <button
        type="submit"
        disabled={busy || token.trim().length === 0}
        className="mono mt-3 rounded-md border border-signal/40 bg-signal/10 px-3 py-1.5 text-[11px] text-signal hover:bg-signal/15 disabled:opacity-50"
      >
        {busy ? "Verifying with Cloudflare…" : "Connect"}
      </button>
    </form>
  );
}
