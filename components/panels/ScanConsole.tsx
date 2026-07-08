"use client";

import { useEffect, useRef } from "react";
import type { LogLine, StageState } from "@/components/useScan";

const LEVEL_MARK: Record<LogLine["level"], { mark: string; color: string }> = {
  info: { mark: "›", color: "text-ink-faint" },
  add: { mark: "+", color: "text-signal" },
  signal: { mark: "!", color: "text-risk-medium" },
  warn: { mark: "△", color: "text-risk-high" },
};

export function ScanConsole({ stages, logs, scanning }: { stages: StageState[]; logs: LogLine[]; scanning: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [logs.length]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-4 py-3">
        <div className="mono text-[11px] uppercase tracking-wider text-ink-faint">Discovery sequence</div>
        <div className="mt-3 space-y-1.5">
          {stages.map((s) => (
            <div key={s.stage} className="flex items-center gap-2.5 text-xs">
              <StageDot status={s.status} />
              <span className={s.status === "done" ? "text-ink-soft" : s.status === "active" ? "text-ink" : "text-ink-faint"}>
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div ref={scrollRef} className="scroll-thin flex-1 space-y-1 overflow-y-auto px-4 py-3">
        {logs.map((l, i) => {
          const m = LEVEL_MARK[l.level];
          return (
            <div key={i} className="mono flex gap-2 text-[12px] leading-relaxed animate-fade-up">
              <span className={`${m.color} w-3 shrink-0`}>{m.mark}</span>
              <span className={l.level === "signal" ? "text-risk-medium" : l.level === "warn" ? "text-risk-high" : "text-ink-soft"}>
                {l.message}
              </span>
            </div>
          );
        })}
        {scanning && (
          <div className="mono flex gap-2 text-[12px] text-signal">
            <span className="w-3 shrink-0">▍</span>
            <span className="animate-pulse">working…</span>
          </div>
        )}
      </div>
    </div>
  );
}

function StageDot({ status }: { status: StageState["status"] }) {
  if (status === "done") return <span className="text-signal">✓</span>;
  if (status === "active")
    return (
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-signal" />
      </span>
    );
  return <span className="h-2 w-2 rounded-full border border-line" />;
}
