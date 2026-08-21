"use client";

import { useTranslator } from "@/lib/i18n/context";
import { renderWithLiterals } from "./literals";

import { useCallback, useEffect, useState } from "react";

interface Preview {
  record: { name: string; type: string; content: string };
  summary: string;
}
/**
 * The post-change check, observed over public DNS. Null means the change has
 * never been checked from outside — which is not the same as failing, and must
 * not be shown as if it were.
 */
type Verification = { status: "passed" | "not_observed" | "mismatch"; observed: string | null; checkedAt: string } | null;

interface ZoneState {
  name: string;
  verified: boolean;
  applied: { id: string; appliedAt: string; verification: Verification } | null;
  preview: Preview;
}

/**
 * The one remediation OUTSIDE can apply for you: a DMARC record in monitoring
 * mode (p=none). It blocks no mail and does not request reports without a
 * destination. The exact record is shown before anything is written.
 */
export function DmarcRemediation({ orgId }: { orgId: string }) {
  const tr = useTranslator();
  const d = (key: Parameters<typeof tr.t<"integrations">>[1], values?: Record<string, string | number>) =>
    tr.t("integrations", key, values);
  const [zones, setZones] = useState<ZoneState[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [checking, setChecking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    // A failure here must never be rendered as "no zones": that hides the whole
    // panel, including the Roll back control for a change already written to
    // live DNS. Say what went wrong and offer a retry instead.
    setLoadError(null);
    try {
      const res = await fetch(`/api/integrations/cloudflare/dmarc?orgId=${encodeURIComponent(orgId)}`, { credentials: "include" });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(typeof detail?.error === "string" ? detail.error : tr.t("integrations", "dmarcLoadFailed"));
      }
      setZones((await res.json()).zones ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : tr.t("integrations", "dmarcLoadFailed"));
    }
    // tr is memoized on the locale, so this does not re-run every render.
  }, [orgId, tr]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function act(target: string, apply: boolean) {
    const confirmed = window.confirm(
      apply
        ? d("dmarcConfirmApply", { domain: target })
        : d("dmarcConfirmRollback", { domain: target }),
    );
    if (!confirmed) return;
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
      if (!res.ok) setError((await res.json()).error ?? d("dmarcChangeFailed"));
      else await load();
    } catch {
      setError(d("dmarcNetworkError"));
    }
    setBusy(null);
  }

  /** Ask again: public DNS rarely serves the record the second it is written. */
  async function recheck(target: string) {
    setChecking(target);
    setError(null);
    try {
      const res = await fetch("/api/integrations/cloudflare/dmarc", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ orgId, target }),
      });
      if (!res.ok) setError((await res.json().catch(() => null))?.error ?? d("dmarcCheckFailed"));
      else await load();
    } catch {
      setError(d("dmarcNetworkError"));
    }
    setChecking(null);
  }

  /** Never-checked reads as unknown, not as failure — the distinction is the point. */
  function checkLabel(verification: Verification): { text: string; tone: string } {
    if (!verification) return { text: d("dmarcCheckUnknown"), tone: "text-ink-faint" };
    if (verification.status === "passed") return { text: d("dmarcCheckPassed", { date: tr.formatDate(verification.checkedAt) }), tone: "text-signal" };
    if (verification.status === "mismatch") return { text: d("dmarcCheckMismatch"), tone: "text-risk-high" };
    return { text: d("dmarcCheckNotObserved"), tone: "text-risk-medium" };
  }

  if (loadError) {
    return (
      <div role="alert" className="mono mt-3 rounded-md border border-risk-medium/30 bg-risk-medium/5 px-2.5 py-2 text-[11px] leading-5 text-risk-medium">
        {loadError}{" "}
        <button
          type="button"
          onClick={() => void load()}
          className="underline underline-offset-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
        >
          {d("dmarcTryAgain")}
        </button>
      </div>
    );
  }
  if (!zones) return <div className="mono mt-3 text-[11px] text-ink-faint">{d("dmarcLoadingDomains")}</div>;
  if (zones.length === 0) return null;

  return (
    <div className="mt-4 border-t border-line pt-3">
      <div className="mono text-[11px] uppercase tracking-wide text-ink-faint">{d("dmarcHeading")}</div>
      <p className="mono mt-1 text-[11px] leading-5 text-ink-faint">
        {renderWithLiterals(d("dmarcExplainer"), { policy: "p=none" })}
      </p>
      {error && <p role="alert" aria-live="assertive" className="mono mt-2 text-[11px] text-risk-high">{error}</p>}

      <ul className="mt-3 space-y-2">
        {zones.map((zone) => {
          const check = zone.applied ? checkLabel(zone.applied.verification) : null;
          return (
          <li key={zone.name} className="rounded-lg border border-line bg-base-950/50 p-2.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="mono text-[12px] text-ink">{zone.name}</span>
              {zone.applied ? (
                <>
                  <span className="mono text-[11px] text-signal">{d("dmarcApplied", { date: tr.formatDate(zone.applied.appliedAt) })}</span>
                  <span className={`mono text-[11px] ${check!.tone}`}>{check!.text}</span>
                </>
              ) : zone.verified ? (
                <span className="mono text-[11px] text-ink-faint">{d("dmarcNotApplied")}</span>
              ) : (
                <span className="mono text-[11px] text-risk-medium">{d("dmarcVerifyFirst")}</span>
              )}

              <div className="ml-auto flex items-center gap-2">
                {zone.verified && (
                  <button
                    onClick={() => setExpanded(expanded === zone.name ? null : zone.name)}
                    aria-expanded={expanded === zone.name}
                    aria-controls={`dmarc-preview-${zone.name}`}
                    className="mono min-h-11 rounded-md border border-line px-3 py-2 text-xs text-ink-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
                  >
                    {expanded === zone.name ? d("dmarcHideRecord") : d("dmarcPreviewRecord")}
                  </button>
                )}
                {zone.verified && !zone.applied && (
                  <button
                    onClick={() => act(zone.name, true)}
                    disabled={busy === zone.name}
                    className="mono min-h-11 rounded-md border border-signal/40 bg-signal/10 px-3 py-2 text-xs text-signal hover:bg-signal/15 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
                  >
                    {busy === zone.name ? d("dmarcApplying") : d("dmarcApply")}
                  </button>
                )}
                {zone.applied && (
                  <button
                    onClick={() => recheck(zone.name)}
                    disabled={checking === zone.name || busy === zone.name}
                    className="mono min-h-11 rounded-md border border-line px-3 py-2 text-xs text-ink-soft hover:text-ink disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
                  >
                    {checking === zone.name ? d("dmarcChecking") : d("dmarcCheckAgain")}
                  </button>
                )}
                {zone.applied && (
                  <button
                    onClick={() => act(zone.name, false)}
                    disabled={busy === zone.name}
                    className="mono min-h-11 rounded-md border border-risk-high/40 px-3 py-2 text-xs text-risk-high hover:bg-risk-high/5 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-risk-high"
                  >
                    {busy === zone.name ? d("dmarcRollingBack") : d("dmarcRollback")}
                  </button>
                )}
              </div>
            </div>

            {expanded === zone.name && (
              <div id={`dmarc-preview-${zone.name}`} className="mt-2 rounded-md border border-line bg-base-900 p-2">
                <div className="mono text-[11px] text-ink-faint">{d("dmarcExactRecord")}</div>
                <pre className="mono mt-1 overflow-x-auto text-[11px] text-ink-soft">{zone.preview.record.type}  {zone.preview.record.name}
{zone.preview.record.content}</pre>
              </div>
            )}
          </li>
          );
        })}
      </ul>
    </div>
  );
}
