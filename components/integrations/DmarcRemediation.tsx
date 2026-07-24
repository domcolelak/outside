"use client";

import { useCallback, useEffect, useState } from "react";

interface Preview {
  record: { name: string; type: string; content: string };
  summary: string;
}
interface ZoneState {
  name: string;
  verified: boolean;
  applied: { id: string; appliedAt: string } | null;
  preview: Preview;
}

/**
 * The one remediation OUTSIDE can apply for you: a DMARC record in monitoring
 * mode (p=none). It turns reporting on, blocks no mail, and is removed again by
 * the rollback button. The exact record is shown before anything is written.
 */
export function DmarcRemediation({ orgId }: { orgId: string }) {
  const [zones, setZones] = useState<ZoneState[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/integrations/cloudflare/dmarc?orgId=${encodeURIComponent(orgId)}`, { credentials: "include" });
      if (res.ok) setZones((await res.json()).zones ?? []);
      else setZones([]);
    } catch {
      setZones([]);
    }
  }, [orgId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function act(target: string, apply: boolean) {
    setBusy(target);
    setError(null);
    try {
      const res = apply
        ? await fetch("/api/integrations/cloudflare/dmarc", {
            method: "POST",
            headers: { "content-type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ orgId, target }),
          })
        : await fetch(`/api/integrations/cloudflare/dmarc?orgId=${encodeURIComponent(orgId)}&target=${encodeURIComponent(target)}`, {
            method: "DELETE",
            credentials: "include",
          });
      if (!res.ok) setError((await res.json()).error ?? "The change was not applied.");
      else await load();
    } catch {
      setError("Network error. Nothing was changed.");
    }
    setBusy(null);
  }

  if (!zones) return <div className="mono mt-3 text-[11px] text-ink-faint">Loading domains…</div>;
  if (zones.length === 0) return null;

  return (
    <div className="mt-4 border-t border-line pt-3">
      <div className="mono text-[11px] uppercase tracking-wide text-ink-faint">Guided remediation · DMARC monitoring</div>
      <p className="mono mt-1 text-[11px] leading-5 text-ink-faint">
        Adds a DMARC record in monitoring mode (<span className="text-ink-soft">p=none</span>). It enables reporting, blocks no mail, and can be rolled back here.
      </p>
      {error && <p role="alert" className="mono mt-2 text-[11px] text-risk-high">{error}</p>}

      <ul className="mt-3 space-y-2">
        {zones.map((zone) => (
          <li key={zone.name} className="rounded-lg border border-line bg-base-950/50 p-2.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="mono text-[12px] text-ink">{zone.name}</span>
              {zone.applied ? (
                <span className="mono text-[11px] text-signal">✓ applied {new Date(zone.applied.appliedAt).toLocaleDateString()}</span>
              ) : zone.verified ? (
                <span className="mono text-[11px] text-ink-faint">not applied</span>
              ) : (
                <span className="mono text-[11px] text-risk-medium">verify this domain first</span>
              )}

              <div className="ml-auto flex items-center gap-2">
                {zone.verified && (
                  <button
                    onClick={() => setExpanded(expanded === zone.name ? null : zone.name)}
                    className="mono rounded-md border border-line px-2 py-1 text-[11px] text-ink-soft hover:text-ink"
                  >
                    {expanded === zone.name ? "Hide record" : "Preview record"}
                  </button>
                )}
                {zone.verified && !zone.applied && (
                  <button
                    onClick={() => act(zone.name, true)}
                    disabled={busy === zone.name}
                    className="mono rounded-md border border-signal/40 bg-signal/10 px-2 py-1 text-[11px] text-signal hover:bg-signal/15 disabled:opacity-50"
                  >
                    {busy === zone.name ? "Applying…" : "Apply"}
                  </button>
                )}
                {zone.applied && (
                  <button
                    onClick={() => act(zone.name, false)}
                    disabled={busy === zone.name}
                    className="mono rounded-md border border-line px-2 py-1 text-[11px] text-ink-soft hover:text-ink disabled:opacity-50"
                  >
                    {busy === zone.name ? "Rolling back…" : "Roll back"}
                  </button>
                )}
              </div>
            </div>

            {expanded === zone.name && (
              <div className="mt-2 rounded-md border border-line bg-base-900 p-2">
                <div className="mono text-[11px] text-ink-faint">This exact record will be created:</div>
                <pre className="mono mt-1 overflow-x-auto text-[11px] text-ink-soft">{zone.preview.record.type}  {zone.preview.record.name}
{zone.preview.record.content}</pre>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
