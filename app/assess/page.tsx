"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslator } from "@/lib/i18n/context";
import { checkTextKey } from "@/lib/assess/text";

interface Check { id: string; version: string; title: string; category: string; rationale: string; remediation: string; references: string[] }
interface CheckResult { check: Check; status: "pass" | "fail" | "not_evaluated"; severity: string | null; findingIds: string[]; reason?: string }
interface Run { id: string; target: string; catalogueVersion: string; passed: number; failed: number; notEvaluated: number; createdAt: string; results: CheckResult[] }
interface RunSummary { id: string; passed: number; failed: number; notEvaluated: number; createdAt: string }
interface Diff { fixed: string[]; regressed: string[]; stillFailing: string[]; newlyEvaluated: string[]; coverageLost: string[] }
interface Status {
  catalogue: { version: string; checks: Check[] };
  target: string | null;
  verified?: boolean;
  runs?: RunSummary[];
  latest?: Run | null;
  diff?: Diff | null;
}

const SEVERITY_COLOR: Record<string, string> = { critical: "text-risk-high", high: "text-risk-high", medium: "text-risk-medium", low: "text-ink-soft", info: "text-ink-faint" };

function AssessView() {
  const tr = useTranslator();
  const a = (key: Parameters<typeof tr.t<"assess">>[1], values?: Record<string, string | number>) => tr.t("assess", key, values);
  const params = useSearchParams();
  const [target, setTarget] = useState(params.get("target") ?? "");
  const [status, setStatus] = useState<Status | null>(null);
  const [run, setRun] = useState<{ run: Run; diff: Diff | null } | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadStatus(t: string) {
    setError(null);
    setRun(null);
    const query = t.trim() ? `?target=${encodeURIComponent(t.trim())}` : "";
    const res = await fetch(`/api/assess${query}`, { credentials: "include" });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? a("loadFailed")); return; }
    setStatus(data);
    if (data.latest) setRun({ run: data.latest, diff: data.diff ?? null });
  }

  useEffect(() => {
    const initial = params.get("target") ?? "";
    const timer = window.setTimeout(() => void loadStatus(initial), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runAssessment() {
    if (running || !target.trim()) return;
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/assess", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ target: target.trim() }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? a("runFailed"));
      else { setRun(data); await loadStatus(target); }
    } catch {
      setError(a("networkError"));
    }
    setRunning(false);
  }

  const checks = status?.catalogue.checks ?? [];
  const results = run?.run.results ?? null;

  return (
    <>
      <div className="mono text-[12px] uppercase tracking-widest text-signal">{a("kicker")}</div>
      <h1 className="mt-2 text-3xl font-semibold text-ink">{a("title")}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
        {a("intro")}
      </p>

      <form onSubmit={(e) => { e.preventDefault(); void loadStatus(target); }} className="mt-6 flex flex-wrap gap-2">
        <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder={a("targetPlaceholder")} spellCheck={false} autoComplete="off" className="mono min-w-0 flex-1 rounded-lg border border-line bg-base-950 px-3 py-2 text-sm text-ink" />
        <button type="submit" className="mono rounded-lg border border-line px-3 py-2 text-sm text-ink-soft hover:text-ink">{a("checkStatus")}</button>
        <button type="button" onClick={runAssessment} disabled={running || !status?.verified} className="rounded-lg bg-signal px-4 py-2 text-sm font-semibold text-base-950 disabled:opacity-50">
          {running ? a("assessing") : a("runAssessment")}
        </button>
      </form>

      {error && <div role="alert" className="mt-4 rounded-lg border border-risk-high/30 bg-risk-high/5 px-4 py-3 text-sm text-risk-high">{error}</div>}

      {status?.target && status.verified === false && (
        <div className="mt-4 rounded-lg border border-risk-medium/30 bg-risk-medium/5 px-4 py-3 text-sm text-ink-soft">
          <span className="text-risk-medium">{a("notVerifiedLead")}</span> {a("notVerifiedBody")}{" "}
          <Link href={`/scan?target=${encodeURIComponent(status.target)}`} className="text-signal hover:underline">{a("verifyLink", { target: status.target })}</Link> {a("notVerifiedTail")}
        </div>
      )}

      {run && results && (
        <section className="mt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-medium text-ink">{a("resultsFor", { target: run.run.target })}</h2>
            <span className="mono text-xs text-ink-faint">{tr.formatDate(run.run.createdAt, { dateStyle: "medium", timeStyle: "short" })} · {a("catalogueMeta", { version: run.run.catalogueVersion })}</span>
          </div>
          <div className="mono mt-2 flex flex-wrap gap-x-6 text-xs">
            <span className="text-signal">{a("passedCount", { count: run.run.passed })}</span>
            <span className={run.run.failed > 0 ? "text-risk-high" : "text-ink-faint"}>{a("failedCount", { count: run.run.failed })}</span>
            <span className={run.run.notEvaluated > 0 ? "text-risk-medium" : "text-ink-faint"}>{a("notEvaluatedCount", { count: run.run.notEvaluated })}</span>
            {run.diff && (run.diff.fixed.length > 0 || run.diff.regressed.length > 0 || run.diff.coverageLost.length > 0 || run.diff.newlyEvaluated.length > 0) && (
              <span className="flex flex-wrap items-center gap-x-2 text-ink-faint">
                <span>{a("retest")}</span>
                {run.diff.fixed.length > 0 && <span className="text-signal">{a("fixedCount", { count: run.diff.fixed.length })}</span>}
                {run.diff.regressed.length > 0 && <span className="text-risk-high">{a("regressedCount", { count: run.diff.regressed.length })}</span>}
                {/* Losing the ability to judge a check is its own event: the result
                    did not improve, it stopped being knowable. Silently dropping
                    it out of the failed count would read as progress. */}
                {run.diff.coverageLost.length > 0 && <span className="text-risk-medium">{a("lostCoverageCount", { count: run.diff.coverageLost.length })}</span>}
                {run.diff.newlyEvaluated.length > 0 && <span className="text-ink-soft">{a("newlyCoveredCount", { count: run.diff.newlyEvaluated.length })}</span>}
              </span>
            )}
          </div>

          <ul className="mt-4 space-y-2">
            {results.map((result) => {
              const regressed = run.diff?.regressed.includes(result.check.id);
              const fixed = run.diff?.fixed.includes(result.check.id);
              const coverageLost = run.diff?.coverageLost.includes(result.check.id);
              const newlyEvaluated = run.diff?.newlyEvaluated.includes(result.check.id);
              return (
                <li key={result.check.id} className="panel p-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className={`mono text-[11px] uppercase tracking-wide ${result.status === "pass" ? "text-signal" : result.status === "not_evaluated" ? "text-risk-medium" : SEVERITY_COLOR[result.severity ?? "medium"]}`}>
                      {result.status === "pass" ? a("statusPass") : result.status === "not_evaluated" ? a("statusNotEvaluated") : a("statusFail")}
                    </span>
                    <span className="text-sm text-ink">{a(checkTextKey(result.check.id, "Title"))}</span>
                    {result.status === "fail" && result.severity && <span className={`mono text-[10px] uppercase ${SEVERITY_COLOR[result.severity]}`}>{result.severity}</span>}
                    {fixed && <span className="mono text-[10px] uppercase text-signal">{a("badgeNewlyFixed")}</span>}
                    {regressed && <span className="mono text-[10px] uppercase text-risk-high">{a("badgeRegressed")}</span>}
                    {coverageLost && <span className="mono text-[10px] uppercase text-risk-medium">{a("badgeLostCoverage")}</span>}
                    {newlyEvaluated && <span className="mono text-[10px] uppercase text-ink-soft">{a("badgeNewlyCovered")}</span>}
                    <span className="mono ml-auto text-[10px] text-ink-faint">v{result.check.version}</span>
                  </div>
                  {result.status === "fail" && (
                    <p className="mt-2 text-xs leading-relaxed text-ink-soft"><span className="text-ink-faint">{a("remediationLabel")}</span>{a(checkTextKey(result.check.id, "Remediation"))}</p>
                  )}
                  {result.status === "not_evaluated" && (
                    <p className="mt-2 text-xs leading-relaxed text-risk-medium">{result.reason ?? a("observationUnavailable")}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {!run && checks.length > 0 && (
        <section className="mt-8">
          <div className="mono text-[11px] uppercase tracking-wider text-ink-faint">{a("catalogueHeading", { count: checks.length, version: status?.catalogue.version ?? "" })}</div>
          <ul className="mt-3 grid gap-2 md:grid-cols-2">
            {checks.map((check) => (
              <li key={check.id} className="panel p-3">
                <div className="text-sm text-ink">{a(checkTextKey(check.id, "Title"))}</div>
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">{a(checkTextKey(check.id, "Rationale"))}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

export default function AssessPage() {
  return <Suspense><AssessView /></Suspense>;
}
