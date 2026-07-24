"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Wordmark } from "@/components/Wordmark";

interface AssetChange { canonical: string; label: string; change: "added" | "removed" | "modified"; details: string[] }
interface Diff { from: { observedAt: string } | null; exposureScoreDelta: number; assetChanges: AssetChange[]; summary: string }
interface ReplayStep { observedAt: string; scanId: string; exposureScore: number; diff: Diff }

const CHANGE_META: Record<AssetChange["change"], { mark: string; color: string }> = {
  added: { mark: "+", color: "#38e1c3" },
  removed: { mark: "−", color: "#6b7793" },
  modified: { mark: "≠", color: "#f5c451" },
};

function ChronosView() {
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
      if (res.status === 401) { setState("error"); setMessage("Sign in to view a target's history."); return; }
      if (res.status === 402) { setState("error"); setMessage("Chronos requires a Professional or Agency plan."); return; }
      if (res.status === 404) { setState("error"); setMessage("No recorded history for this target yet — Chronos fills in as Guardian scans accumulate."); return; }
      if (!res.ok) { setState("error"); setMessage("Could not load history."); return; }
      const data = await res.json();
      setSteps(data.steps ?? []);
      setState("done");
    } catch { setState("error"); setMessage("Network error."); }
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
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link href="/"><Wordmark className="h-6" /></Link>
          <Link href="/account" className="mono text-xs text-ink-soft hover:text-ink">Back to account</Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="mono text-[12px] uppercase tracking-widest text-signal">Chronos · security time machine</div>
        <h1 className="mt-2 text-3xl font-semibold text-ink">How this surface changed over time</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Point-in-time reconstruction and replay across a verified target&apos;s recorded history — what appeared, what
          disappeared, what changed, and how protection posture moved. Higher scores indicate stronger protection, and
          every change is grounded in observations that were actually recorded.
        </p>

        <form onSubmit={(e) => { e.preventDefault(); load(target); }} className="mt-6 flex gap-2">
          <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="yourcompany.com" className="mono flex-1 rounded-lg border border-line bg-base-950 px-3 py-2 text-sm" />
          <button disabled={state === "loading"} className="rounded-lg bg-signal px-4 py-2 text-sm font-semibold text-base-950 disabled:opacity-50">{state === "loading" ? "Loading…" : "Replay history"}</button>
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
                  <span className="mono text-sm text-ink">{new Date(s.observedAt).toLocaleString()}</span>
                  <span className="mono text-xs text-ink-faint">
                    protection posture <span className="text-ink">{s.exposureScore}/100</span>
                    {s.diff.from && s.diff.exposureScoreDelta !== 0 && (
                      <span className={s.diff.exposureScoreDelta > 0 ? "text-signal" : "text-risk-high"}> ({s.diff.exposureScoreDelta > 0 ? "+" : ""}{s.diff.exposureScoreDelta})</span>
                    )}
                  </span>
                </div>
                <p className="mt-1 text-sm text-ink-soft">{s.diff.summary}</p>
                {s.diff.assetChanges.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {s.diff.assetChanges.slice(0, 12).map((c) => (
                      <div key={c.canonical} className="flex items-start gap-2 text-xs">
                        <span className="mono mt-0.5 w-3 text-center" style={{ color: CHANGE_META[c.change].color }}>{CHANGE_META[c.change].mark}</span>
                        <div><span className="mono text-ink">{c.label}</span>{c.details.length > 0 && <span className="text-ink-faint"> — {c.details.join("; ")}</span>}</div>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}

        {state === "done" && steps.length === 0 && (
          <div className="mt-6 rounded-lg border border-line bg-base-900 px-4 py-3 text-sm text-ink-soft">No recorded points yet.</div>
        )}
      </main>
    </div>
  );
}

export default function ChronosPage() {
  return <Suspense><ChronosView /></Suspense>;
}
