"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslator } from "@/lib/i18n/context";

interface AssetChange { canonical: string; label: string; change: "added" | "removed" | "modified"; details: string[] }
interface Diff { from: { observedAt: string } | null; exposureScoreDelta: number; assetChanges: AssetChange[]; summary: string }
interface ReplayStep { observedAt: string; scanId: string; exposureScore: number; diff: Diff }

const CHANGE_META: Record<AssetChange["change"], { mark: string; color: string }> = {
  added: { mark: "+", color: "#38e1c3" },
  removed: { mark: "−", color: "#6b7793" },
  modified: { mark: "≠", color: "#f5c451" },
};

function ChronosView() {
  const tr = useTranslator();
  const cx = (key: Parameters<typeof tr.t<"chronos">>[1], values?: Record<string, string | number>) => tr.t("chronos", key, values);
  const params = useSearchParams();
  const [target, setTarget] = useState(params.get("target") ?? "");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [steps, setSteps] = useState<ReplayStep[]>([]);
  const [message, setMessage] = useState<string>("");

  const load = async (t: string) => {
    if (!t.trim()) return;
    setState("loading"); setMessage("");
    try {
      const orgId = params.get("orgId");
      const res = await fetch(`/api/chronos?target=${encodeURIComponent(t)}${orgId ? `&orgId=${encodeURIComponent(orgId)}` : ""}`);
      if (res.status === 401) { setState("error"); setMessage(cx("signInRequired")); return; }
      if (res.status === 402) { setState("error"); setMessage(cx("planRequired")); return; }
      if (res.status === 404) { setState("error"); setMessage(cx("noHistory")); return; }
      if (!res.ok) { setState("error"); setMessage(cx("loadFailed")); return; }
      const data = await res.json();
      setSteps(data.steps ?? []);
      setState("done");
    } catch { setState("error"); setMessage(cx("networkError")); }
  };

  useEffect(() => {
    const t = params.get("target");
    // A timeout, not requestAnimationFrame: rAF never fires in a background tab,
    // which would leave the history loading forever.
    const timer = t ? window.setTimeout(() => void load(t), 0) : 0;
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
        <div className="mono text-[12px] uppercase tracking-widest text-signal">{cx("kicker")}</div>
        <h1 className="mt-2 text-3xl font-semibold text-ink">{cx("title")}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
          {cx("intro")}
        </p>

        <form onSubmit={(e) => { e.preventDefault(); load(target); }} className="mt-6 flex gap-2">
          <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder={cx("targetPlaceholder")} className="mono flex-1 rounded-lg border border-line bg-base-950 px-3 py-2 text-sm" />
          <button disabled={state === "loading"} className="rounded-lg bg-signal px-4 py-2 text-sm font-semibold text-base-950 disabled:opacity-50">{state === "loading" ? cx("loading") : cx("replay")}</button>
        </form>

        {state === "error" && (
          <div className="mt-6 rounded-lg border border-line bg-base-900 px-4 py-3 text-sm text-ink-soft">{message}</div>
        )}

        {state === "done" && steps.length > 0 && (
          <ol className="mt-8 space-y-4">
            {[...steps].reverse().map((s) => (
              <li key={s.scanId} className="relative border-l border-line pl-6">
                <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full" style={{ background: s.diff.exposureScoreDelta > 0 ? "#38e1c3" : s.diff.exposureScoreDelta < 0 ? "#ff8a5b" : "#6b7793" }} />
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="mono text-sm text-ink">{tr.formatDate(s.observedAt, { dateStyle: "medium", timeStyle: "short" })}</span>
                  <span className="mono text-xs text-ink-faint">
                    {cx("protectionPosture")} <span className="text-ink">{s.exposureScore}/100</span>
                    {s.diff.from && s.diff.exposureScoreDelta !== 0 && (
                      <span className={s.diff.exposureScoreDelta > 0 ? "text-signal" : "text-risk-high"}> ({s.diff.exposureScoreDelta > 0 ? "+" : ""}{s.diff.exposureScoreDelta})</span>
                    )}
                  </span>
                </div>
                <p className="mt-1 text-sm text-ink-soft">
                  {s.diff.from
                    ? cx("diffSummary", {
                        added: s.diff.assetChanges.filter((change) => change.change === "added").length,
                        removed: s.diff.assetChanges.filter((change) => change.change === "removed").length,
                        modified: s.diff.assetChanges.filter((change) => change.change === "modified").length,
                      })
                    : cx("initialSummary", { count: s.diff.assetChanges.length })}
                </p>
                {s.diff.assetChanges.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {s.diff.assetChanges.slice(0, 12).map((c) => (
                      <div key={c.canonical} className="flex items-start gap-2 text-xs">
                        <span className="mono mt-0.5 w-3 text-center" style={{ color: CHANGE_META[c.change].color }}>{CHANGE_META[c.change].mark}</span>
                        <div><span className="mono text-ink">{c.label}</span><span className="text-ink-faint"> · {cx(`change${c.change[0]!.toUpperCase()}${c.change.slice(1)}` as Parameters<typeof tr.t<"chronos">>[1])}</span></div>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}

        {state === "done" && steps.length === 0 && (
          <div className="mt-6 rounded-lg border border-line bg-base-900 px-4 py-3 text-sm text-ink-soft">{cx("noPoints")}</div>
        )}
      </>
  );
}

export default function ChronosPage() {
  return <Suspense><ChronosView /></Suspense>;
}
