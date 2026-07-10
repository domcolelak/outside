"use client";

import { useEffect, useState } from "react";

interface ScanPoint {
  id: string;
  finishedAt: string;
  score: number;
  assets: number;
  mode: string;
}

/** Exposure-score timeline for a target (real persisted scans only). */
export function HistoryPanel({ target, isDemo }: { target: string; isDemo: boolean }) {
  const [scans, setScans] = useState<ScanPoint[]>([]);
  const [durable, setDurable] = useState(false);

  useEffect(() => {
    if (isDemo) return;
    fetch(`/api/history?target=${encodeURIComponent(target)}`)
      .then((r) => r.json())
      .then((d) => { setScans(d.scans ?? []); setDurable(!!d.durable); })
      .catch(() => {});
  }, [target, isDemo]);

  if (isDemo || scans.length < 2) return null;

  const ordered = [...scans].reverse(); // oldest -> newest
  const max = 100;

  return (
    <div>
      <div className="mono mb-2 flex items-center justify-between text-[11px] uppercase tracking-wider text-ink-faint">
        <span>Exposure history</span>
        <span>{scans.length} scans{durable ? "" : " · session"}</span>
      </div>
      <div className="panel p-3">
        <div className="flex h-16 items-end gap-1">
          {ordered.map((s) => {
            const h = Math.max(4, (s.score / max) * 100);
            const color = s.score >= 80 ? "#38e1c3" : s.score >= 60 ? "#5b8cff" : s.score >= 40 ? "#f5c451" : "#ff8a5b";
            return (
              <div key={s.id} className="group relative flex-1" title={`${new Date(s.finishedAt).toLocaleString()} · ${s.score}/100 · ${s.assets} assets`}>
                <div className="w-full rounded-t" style={{ height: `${h}%`, background: color, opacity: 0.85 }} />
              </div>
            );
          })}
        </div>
        <div className="mono mt-2 flex justify-between text-[10px] text-ink-faint">
          <span>{new Date(ordered[0]!.finishedAt).toLocaleDateString()}</span>
          <span>latest {ordered[ordered.length - 1]!.score}/100</span>
        </div>
      </div>
    </div>
  );
}
