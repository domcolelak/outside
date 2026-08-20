"use client";

import { useEffect, useState } from "react";
import { useTranslator } from "@/lib/i18n/context";

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
interface DraftChange { proposalId: string; file: string; entry: string; requiresHumanInput: string[]; note: string }
interface EvolutionData { kevSyncedAt: string | null; kevSize: number; gapCount: number; decisionsCount: number; detectorReliability: DetectorReliability[]; lastScheduledRun: { at: string; total: number } | null; proposals: Proposal[] }

const PRIORITY_COLOR: Record<Proposal["priority"], string> = { high: "text-risk-high", medium: "text-risk-medium", low: "text-ink-faint" };

export default function EvolutionPage() {
  const tr = useTranslator();
  const [state, setState] = useState<"loading" | "done" | "error">("loading");
  const [data, setData] = useState<EvolutionData | null>(null);
  const [message, setMessage] = useState("");
  const [deciding, setDeciding] = useState<Record<string, "approved" | "rejected">>({});
  const [drafts, setDrafts] = useState<Record<string, DraftChange>>({});
  const [approved, setApproved] = useState<Record<string, true>>({});
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/evolution")
      .then(async (res) => {
        if (res.status === 401) { setMessage(tr.t("evolution", "signInRequired")); setState("error"); return; }
        if (res.status === 403) { setMessage(tr.t("evolution", "ownerOnly")); setState("error"); return; }
        if (!res.ok) { setMessage(tr.t("evolution", "loadFailed")); setState("error"); return; }
        setData(await res.json()); setState("done");
      })
      .catch(() => { setMessage(tr.t("evolution", "networkError")); setState("error"); });
  }, [tr]);

  const clearPending = (proposalId: string) => setDeciding((current) => {
    const next = { ...current };
    delete next[proposalId];
    return next;
  });
  const clearActionError = (proposalId: string) => setActionErrors((current) => {
    const next = { ...current };
    delete next[proposalId];
    return next;
  });
  async function prepareDraft(proposalId: string) {
    const response = await fetch(`/api/evolution/draft?proposalId=${encodeURIComponent(proposalId)}`);
    const data = await response.json().catch(() => null) as { draft?: DraftChange; error?: string } | null;
    if (!response.ok || !data?.draft) throw new Error(tr.t("evolution", "draftSavedFailed"));
    setDrafts((current) => ({ ...current, [proposalId]: data.draft! }));
  }
  async function retryDraft(proposalId: string) {
    if (deciding[proposalId]) return;
    clearActionError(proposalId);
    setDeciding((current) => ({ ...current, [proposalId]: "approved" }));
    try {
      await prepareDraft(proposalId);
    } catch (cause) {
      setActionErrors((current) => ({ ...current, [proposalId]: cause instanceof Error ? cause.message : tr.t("evolution", "draftFailed") }));
    } finally {
      clearPending(proposalId);
    }
  }
  async function decide(proposalId: string, decision: "approved" | "rejected") {
    if (deciding[proposalId]) return;
    clearActionError(proposalId);
    setDeciding((d) => ({ ...d, [proposalId]: decision }));
    let decisionSaved = false;
    try {
      const res = await fetch("/api/evolution/decision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proposalId, decision }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(tr.t("evolution", "decisionFailed"));
      }
      decisionSaved = true;
      setData((prev) => prev && { ...prev, decisionsCount: prev.decisionsCount + 1 });
      if (decision === "approved") {
        setApproved((current) => ({ ...current, [proposalId]: true }));
        await prepareDraft(proposalId);
      } else {
        // Rejected proposals drop off the active list; Evolution has learned from this.
        setData((prev) => prev && { ...prev, proposals: prev.proposals.filter((p) => p.id !== proposalId) });
      }
    } catch (cause) {
      const fallback = decisionSaved && decision === "approved"
        ? tr.t("evolution", "draftSavedFailed")
        : tr.t("evolution", "decisionFailed");
      setActionErrors((current) => ({ ...current, [proposalId]: cause instanceof Error ? cause.message : fallback }));
    } finally {
      clearPending(proposalId);
    }
  }

  return (
    <>
        <div className="mono text-[12px] uppercase tracking-widest text-signal">{tr.t("evolution", "kicker")}</div>
        <h1 className="mt-2 text-3xl font-semibold text-ink">{tr.t("evolution", "title")}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
          {tr.t("evolution", "intro")}
        </p>

        <div className="mt-4 rounded-lg border border-signal/30 bg-signal/5 px-3 py-2 text-[12px] text-signal">
          {tr.t("evolution", "safety")}
        </div>

        {state === "loading" && <div role="status" aria-live="polite" className="mt-6 rounded-lg border border-line bg-base-900 px-4 py-3 text-sm text-ink-soft">{tr.t("evolution", "loading")}</div>}
        {state === "error" && <div className="mt-6 rounded-lg border border-line bg-base-900 px-4 py-3 text-sm text-ink-soft">{message}</div>}

        {state === "done" && data && (
          <>
            <div className="mono mt-6 flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-faint">
              <span>{tr.t("evolution", "proposalCount", { count: data.proposals.length })}</span>
              <span>{tr.t("evolution", "kevCount", { count: data.kevSize })}</span>
              <span>{tr.t("evolution", "autoAnalyzed", { date: data.lastScheduledRun ? tr.formatDate(data.lastScheduledRun.at) : tr.t("evolution", "onDemand") })}</span>
              {data.decisionsCount > 0 && <span>{tr.t("evolution", "decisionCount", { count: data.decisionsCount })}</span>}
            </div>

            {data.proposals.length === 0 ? (
              <div className="mt-6 rounded-xl border border-signal/15 bg-signal/[.035] px-4 py-8 text-center">
                <div className="mx-auto grid h-9 w-9 place-items-center rounded-full border border-signal/20 text-sm text-signal">✓</div>
                <div className="mt-3 text-sm font-medium text-ink">{tr.t("evolution", "noGaps")}</div>
                <div className="mt-1 text-xs text-ink-faint">{tr.t("evolution", data.kevSyncedAt ? "allCovered" : "notSynced")}</div>
              </div>
            ) : (
              <ol className="mt-6 space-y-3">
                {data.proposals.map((p) => (
                  <li key={p.id} className="panel p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-ink">{tr.t("evolution", "proposalTitle", { cve: p.evidence.cveId })}</div>
                      <span className={`mono shrink-0 text-[11px] uppercase tracking-wide ${PRIORITY_COLOR[p.priority]}`}>{tr.t("ui", `priority${p.priority[0]!.toUpperCase()}${p.priority.slice(1)}` as Parameters<typeof tr.t<"ui">>[1])}</span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-ink-soft">{tr.t("evolution", "proposalSummary", { cve: p.evidence.cveId })}</p>
                    <div className="mt-2 rounded-lg border border-line bg-base-950/60 px-3 py-2">
                      <div className="mono text-[11px] uppercase tracking-wide text-ink-faint">{tr.t("evolution", "proposedChangeLabel")}</div>
                      <p className="mt-1 text-xs leading-relaxed text-ink-soft">{tr.t("evolution", "proposedChange", { cve: p.evidence.cveId })}</p>
                    </div>
                    <div className="mono mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-faint">
                      <span>{tr.t("evolution", "evidence", { cve: p.evidence.cveId, source: p.evidence.source })}</span>
                      <span>{tr.t("evolution", "added", { date: tr.formatDate(p.evidence.kevDateAdded) })}</span>
                      <span className="rounded-sm border border-line px-1.5 py-0.5">{tr.t("evolution", "status", { status: tr.t("evolution", "statusDraft") })}</span>
                    </div>
                    {drafts[p.id] ? (
                      <div className="mt-3 border-t border-line pt-3">
                        <div className="mono flex items-center gap-2 text-[11px] uppercase tracking-wide text-signal">{tr.t("evolution", "approvedDraftReady")}</div>
                        <div className="mono mt-2 text-[11px] text-ink-faint">{tr.t("evolution", "addTo", { file: drafts[p.id]!.file })}</div>
                        <pre className="mono mt-1 overflow-x-auto rounded-lg border border-line bg-base-950 px-3 py-2 text-[12px] leading-relaxed text-ink-soft">{drafts[p.id]!.entry}</pre>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => navigator.clipboard?.writeText(drafts[p.id]!.entry)}
                            className="mono rounded-md border border-line px-2.5 py-1 text-[11px] text-ink-soft hover:text-ink"
                          >
                            {tr.t("evolution", "copyDraft")}
                          </button>
                          <span className="mono text-[11px] text-ink-faint">{tr.t("evolution", "needsYou")}</span>
                        </div>
                        <div className="mt-2 rounded-lg border border-risk-medium/30 bg-risk-medium/5 px-3 py-2 text-[11px] leading-relaxed text-risk-medium">
                          {tr.t("evolution", "draftNote")}
                        </div>
                      </div>
                    ) : approved[p.id] ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                        <span className="mono text-[11px] uppercase tracking-wide text-signal">{tr.t("evolution", "approvedAwaiting")}</span>
                        <button
                          onClick={() => void retryDraft(p.id)}
                          disabled={!!deciding[p.id]}
                          className="mono rounded-md border border-signal/40 bg-signal/10 px-3 py-1.5 text-[12px] text-signal hover:bg-signal/15 disabled:opacity-50"
                        >
                          {tr.t("evolution", deciding[p.id] ? "preparingDraft" : "retryDraft")}
                        </button>
                      </div>
                    ) : (
                      <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
                        <button
                          onClick={() => decide(p.id, "approved")}
                          disabled={!!deciding[p.id]}
                          className="mono rounded-md border border-signal/40 bg-signal/10 px-3 py-1.5 text-[12px] text-signal hover:bg-signal/15 disabled:opacity-50"
                        >
                          {tr.t("evolution", deciding[p.id] === "approved" ? "preparingDraft" : "approve")}
                        </button>
                        <button
                          onClick={() => decide(p.id, "rejected")}
                          disabled={!!deciding[p.id]}
                          className="mono rounded-md border border-line px-3 py-1.5 text-[12px] text-ink-soft hover:text-ink disabled:opacity-50"
                        >
                          {tr.t("evolution", deciding[p.id] === "rejected" ? "rejecting" : "reject")}
                        </button>
                        <span className="mono ml-auto text-[11px] text-ink-faint">{tr.t("evolution", "approveHint")}</span>
                      </div>
                    )}
                    {actionErrors[p.id] && <p role="alert" className="mono mt-2 text-[12px] text-risk-high">{actionErrors[p.id]}</p>}
                  </li>
                ))}
              </ol>
            )}

            {data.detectorReliability.length > 0 && (
              <section className="mt-10">
                <h2 className="text-lg font-medium text-ink">{tr.t("evolution", "detectorReliability")}</h2>
                <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-soft">
                  {tr.t("evolution", "reliabilityBody")}
                </p>
                <ul className="mt-4 space-y-2">
                  {data.detectorReliability.map((d) => (
                    <li key={d.category} className="panel flex flex-wrap items-center gap-x-4 gap-y-1 p-3">
                      <span className="mono text-xs text-ink">{d.category}</span>
                      <span className="mono text-[11px] text-ink-faint">{tr.t("evolution", "detectorMeta", { confirmed: d.confirmed, falsePositive: d.falsePositive })}</span>
                      <span className={`mono ml-auto text-xs ${d.factor < 1 ? "text-risk-medium" : "text-signal"}`}>{tr.t("evolution", "confidenceFactor", { factor: d.factor.toFixed(2) })}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </>
  );
}
