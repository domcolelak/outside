"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";

interface Proposal {
  id: string;
  title: string;
  status: "draft";
  priority: "high" | "medium" | "low";
  summary: string;
  proposedChange: string;
  evidence: { cveId: string; kevDateAdded: string; source: string };
}
interface DetectorReliability { category: string; confirmed: number; falsePositive: number; factor: number }
interface EvolutionData { kevSyncedAt: string | null; kevSize: number; gapCount: number; decisionsCount: number; detectorReliability: DetectorReliability[]; lastScheduledRun: { at: string; total: number } | null; proposals: Proposal[] }

const PRIORITY_COLOR: Record<Proposal["priority"], string> = { high: "text-risk-high", medium: "text-risk-medium", low: "text-ink-faint" };

export default function EvolutionPage() {
  const [state, setState] = useState<"loading" | "done" | "error">("loading");
  const [data, setData] = useState<EvolutionData | null>(null);
  const [message, setMessage] = useState("");
  const [deciding, setDeciding] = useState<Record<string, "approved" | "rejected">>({});

  useEffect(() => {
    fetch("/api/evolution")
      .then(async (res) => {
        if (res.status === 401) { setMessage("Sign in to view the Evolution control center."); setState("error"); return; }
        if (!res.ok) { setMessage("Could not load."); setState("error"); return; }
        setData(await res.json()); setState("done");
      })
      .catch(() => { setMessage("Network error."); setState("error"); });
  }, []);

  async function decide(proposalId: string, decision: "approved" | "rejected") {
    if (deciding[proposalId]) return;
    setDeciding((d) => ({ ...d, [proposalId]: decision }));
    try {
      const res = await fetch("/api/evolution/decision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proposalId, decision }),
      });
      if (!res.ok) { setDeciding((d) => { const n = { ...d }; delete n[proposalId]; return n; }); return; }
      // Decided proposals drop off the active list; Evolution has learned from this.
      setData((prev) => prev && { ...prev, decisionsCount: prev.decisionsCount + 1, proposals: prev.proposals.filter((p) => p.id !== proposalId) });
    } catch {
      setDeciding((d) => { const n = { ...d }; delete n[proposalId]; return n; });
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link href="/"><Wordmark className="h-6" /></Link>
          <Link href="/account" className="mono text-xs text-ink-soft hover:text-ink">Back to account</Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="mono text-[11px] uppercase tracking-widest text-signal">Evolution · control center</div>
        <h1 className="mt-2 text-3xl font-semibold text-ink">What OUTSIDE should learn next</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Evolution watches the external security world and compares it against what OUTSIDE can already do. Below are
          evidence-backed proposals to close coverage gaps — actively-exploited vulnerabilities (CISA KEV) on technologies
          OUTSIDE fingerprints but does not yet correlate. It learns from your decisions: approving or rejecting a proposal
          removes it from the queue and reprioritizes future proposals on the same technology.
        </p>

        <div className="mt-4 rounded-lg border border-signal/30 bg-signal/5 px-3 py-2 text-[11px] text-signal">
          Every proposal is a <span className="font-medium">draft awaiting founder approval</span>. Evolution proposes and prepares — it never applies, merges, or deploys anything on its own.
        </div>

        {state === "error" && <div className="mt-6 rounded-lg border border-line bg-base-900 px-4 py-3 text-sm text-ink-soft">{message}</div>}

        {state === "done" && data && (
          <>
            <div className="mono mt-6 flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-faint">
              <span><span className="text-ink">{data.proposals.length}</span> proposals awaiting review</span>
              <span><span className="text-ink">{data.kevSize}</span> KEV entries analyzed</span>
              <span>Auto-analyzed {data.lastScheduledRun ? new Date(data.lastScheduledRun.at).toLocaleDateString() : "on demand"} · monthly</span>
              {data.decisionsCount > 0 && <span><span className="text-ink">{data.decisionsCount}</span> decision{data.decisionsCount === 1 ? "" : "s"} learned · reprioritizing</span>}
            </div>

            {data.proposals.length === 0 ? (
              <div className="mt-6 rounded-xl border border-signal/15 bg-signal/[.035] px-4 py-8 text-center">
                <div className="mx-auto grid h-9 w-9 place-items-center rounded-full border border-signal/20 text-sm text-signal">✓</div>
                <div className="mt-3 text-sm font-medium text-ink">No open coverage gaps</div>
                <div className="mt-1 text-xs text-ink-faint">{data.kevSyncedAt ? "Every exploited CVE on a fingerprinted technology is already correlated." : "The KEV catalogue has not synced yet — proposals appear once it does."}</div>
              </div>
            ) : (
              <ol className="mt-6 space-y-3">
                {data.proposals.map((p) => (
                  <li key={p.id} className="panel p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-ink">{p.title}</div>
                      <span className={`mono shrink-0 text-[10px] uppercase tracking-wide ${PRIORITY_COLOR[p.priority]}`}>{p.priority}</span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-ink-soft">{p.summary}</p>
                    <div className="mt-2 rounded-lg border border-line bg-base-950/60 px-3 py-2">
                      <div className="mono text-[10px] uppercase tracking-wide text-ink-faint">Proposed change</div>
                      <p className="mt-1 text-xs leading-relaxed text-ink-soft">{p.proposedChange}</p>
                    </div>
                    <div className="mono mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-ink-faint">
                      <span>Evidence: {p.evidence.cveId} · {p.evidence.source}</span>
                      <span>Added {p.evidence.kevDateAdded}</span>
                      <span className="rounded-sm border border-line px-1.5 py-0.5">status: {p.status}</span>
                    </div>
                    <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
                      <button
                        onClick={() => decide(p.id, "approved")}
                        disabled={!!deciding[p.id]}
                        className="mono rounded-md border border-signal/40 bg-signal/10 px-3 py-1.5 text-[11px] text-signal hover:bg-signal/15 disabled:opacity-50"
                      >
                        {deciding[p.id] === "approved" ? "Approving…" : "Approve"}
                      </button>
                      <button
                        onClick={() => decide(p.id, "rejected")}
                        disabled={!!deciding[p.id]}
                        className="mono rounded-md border border-line px-3 py-1.5 text-[11px] text-ink-soft hover:text-ink disabled:opacity-50"
                      >
                        {deciding[p.id] === "rejected" ? "Rejecting…" : "Reject"}
                      </button>
                      <span className="mono ml-auto text-[10px] text-ink-faint">Records intent for a human to implement · never auto-applied</span>
                    </div>
                  </li>
                ))}
              </ol>
            )}

            {data.detectorReliability.length > 0 && (
              <section className="mt-10">
                <h2 className="text-lg font-medium text-ink">Detector reliability</h2>
                <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-soft">
                  Learned from your false-positive / confirmed feedback on findings. A noisy detector has its confidence
                  bounded-down-weighted on future scans — dampened, never silenced, and never inflated. Clear the feedback and it returns to full trust.
                </p>
                <ul className="mt-4 space-y-2">
                  {data.detectorReliability.map((d) => (
                    <li key={d.category} className="panel flex flex-wrap items-center gap-x-4 gap-y-1 p-3">
                      <span className="mono text-xs text-ink">{d.category}</span>
                      <span className="mono text-[10px] text-ink-faint">{d.confirmed} confirmed · {d.falsePositive} false-positive</span>
                      <span className={`mono ml-auto text-xs ${d.factor < 1 ? "text-risk-medium" : "text-signal"}`}>×{d.factor.toFixed(2)} confidence</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
