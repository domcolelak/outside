"use client";

import { useEffect, useState } from "react";
import type { ScanResult } from "@/lib/types";
import { buildExecutiveSummary } from "@/lib/report/summary";
import { findingText } from "@/lib/report/finding-text";
import { useDialogFocus } from "@/components/useDialogFocus";
import { useTranslator } from "@/lib/i18n/context";

const PRIORITY_KEY = {
  critical: "priorityCritical",
  high: "priorityHigh",
  medium: "priorityMedium",
  low: "priorityLow",
  info: "priorityInfo",
} as const;

export function ReportPreview({ result }: { result: ScanResult }) {
  const tr = useTranslator();
  const u = (key: Parameters<typeof tr.t<"ui">>[1], values?: Record<string, string | number>) => tr.t("ui", key, values);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "working" | "error">("idle");
  const dialogRef = useDialogFocus(open);

  useEffect(() => {
    if (!open) return;
    const overflow = document.body.style.overflow;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const download = async () => {
    setState("working");
    try {
      const response = await fetch("/api/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...result, locale: tr.locale }),
      });
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `outside-${result.target.replace(/[^a-z0-9.-]/gi, "_")}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setState("idle");
    } catch {
      setState("error");
    }
  };

  const stats: Array<[number, string]> = [
    [result.stats.assets, u("sharedStatAssets")],
    [result.stats.webSurfaces, u("sharedStatWeb")],
    [result.stats.shadowAssets, u("sharedStatShadow")],
    [result.stats.highPriorityFindings, u("sharedStatPriority")],
  ];
  const anatomy = [
    u("reportAnatomyPosture"),
    u("reportAnatomyFindings"),
    u("reportAnatomyChanges"),
    u("reportAnatomyAssets"),
    u("reportAnatomyMethodology"),
  ];

  return <>
    <button onClick={() => setOpen(true)} className="motion-card group w-full rounded-xl border border-line bg-base-950/30 px-4 py-3 text-left">
      <div className="flex items-center justify-between">
        <div><div className="mono text-[11px] uppercase tracking-wider text-ink-faint">{u("executiveDeliverable")}</div><div className="mt-1 text-sm text-ink">{u("previewPolishedReport")}</div></div>
        <span className="grid h-9 w-9 place-items-center rounded-lg border border-line text-ink-faint transition group-hover:border-signal/30 group-hover:text-signal">↗</span>
      </div>
    </button>
    {open && <div ref={dialogRef} className="fixed inset-0 z-80 grid place-items-center overflow-y-auto bg-base-950/92 p-4 backdrop-blur-xl" role="dialog" aria-modal="true" aria-labelledby="report-preview-title" tabIndex={-1}>
      <div className="my-8 w-full max-w-5xl animate-rise-in">
        <div className="mb-4 flex items-center justify-between">
          <div><div className="mono text-[11px] uppercase tracking-[.18em] text-signal">{u("reportPreview")}</div><div id="report-preview-title" className="mt-1 text-xl font-medium text-ink">{u("boardReadyBrief")}</div></div>
          <div className="flex gap-2">
            <button onClick={() => void download()} disabled={state === "working"} className="rounded-lg bg-signal px-4 py-2 text-xs font-semibold text-base-950 disabled:opacity-50">{u(state === "working" ? "generating" : state === "error" ? "retryExport" : "exportPdf")}</button>
            <button onClick={() => setOpen(false)} className="rounded-lg border border-line px-4 py-2 text-xs text-ink-soft">{u("close")}</button>
          </div>
        </div>
        <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
          <div className="aspect-[1/1.414] overflow-hidden rounded-md bg-[#f5f7fa] text-base-850 shadow-[0_35px_100px_rgba(0,0,0,.55)]">
            <div className="flex items-center justify-between bg-base-900 px-8 py-6 text-white"><div><div className="text-sm font-semibold tracking-[.25em]">OUTSIDE</div><div className="mt-1 text-[10px] tracking-[.15em] text-[#8791a3]">{u("externalSurfaceReport")}</div></div><div className="text-[10px] text-[#8791a3]">{tr.formatDate(result.finishedAt)}</div></div>
            {result.isDemo && <div className="bg-[#fff4e6] px-8 py-2 text-[10px] font-semibold tracking-wider text-[#c85a2b]">{u("demoDatasetUpper")}</div>}
            <div className="p-8">
              <div className="flex items-start justify-between"><div><div className="text-2xl font-semibold">{result.target}</div><div className="mt-1 text-[11px] text-[#8791a3]">{u("scanReference", { scanId: result.scanId.slice(0, 16) })}</div></div><div className="grid h-20 w-20 place-items-center rounded-full border-[7px] border-[#0f8f7a]"><div className="text-center"><div className="text-xl font-semibold">{result.score.value}</div><div className="text-[7px] uppercase text-[#8791a3]">{u("posture")}</div></div></div></div>
              <div className="mt-7 grid grid-cols-4 gap-2">{stats.map(([value, label]) => <div key={label} className="rounded-sm border border-[#e3e7ee] p-3"><div className="text-lg font-semibold">{value}</div><div className="mt-1 text-[7px] uppercase tracking-wide text-[#8791a3]">{label}</div></div>)}</div>
              <div className="mt-7 text-[10px] font-semibold uppercase tracking-wider text-[#4b5568]">{u("executiveSummary")}</div>
              <p className="mt-2 text-[11px] leading-5 text-[#2a3345]">{buildExecutiveSummary(result, tr.locale)}</p>
              <div className="mt-7 text-[10px] font-semibold uppercase tracking-wider text-[#4b5568]">{u("priorityReview")}</div>
              <div className="mt-2 space-y-2">{result.findings.slice(0, 3).map((finding) => { const text = findingText(finding, tr.locale); return <div key={finding.id} className="rounded-sm border border-[#e3e7ee] p-3"><div className="flex justify-between gap-3"><div className="text-[11px] font-semibold">{text.title}</div><div className="text-[7px] font-semibold uppercase text-[#c85a2b]">{u(PRIORITY_KEY[finding.priority] ?? "priorityInfo")}</div></div><div className="mt-1 text-[10px] leading-4 text-[#4b5568]">{text.observation}</div></div>; })}</div>
            </div>
          </div>
          <aside className="space-y-3"><div className="rounded-xl border border-line bg-base-900 p-4"><div className="mono text-[11px] uppercase text-ink-faint">{u("reportAnatomy")}</div><div className="mt-4 space-y-3">{anatomy.map((item, index) => <div key={item} className="flex items-center gap-3 text-xs text-ink-soft"><span className="mono grid h-5 w-5 place-items-center rounded-full bg-signal/10 text-[10px] text-signal">{index + 1}</span>{item}</div>)}</div></div><div className="rounded-xl border border-signal/15 bg-signal/5 p-4 text-[11px] leading-5 text-ink-soft">{u("reportDeterministicNote")}</div></aside>
        </div>
      </div>
    </div>}
  </>;
}
