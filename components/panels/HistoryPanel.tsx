"use client";

import { useEffect, useState } from "react";
import { useTranslator } from "@/lib/i18n/context";

interface ScanPoint {
  id: string;
  finishedAt: string;
  score: number;
  assets: number;
  mode: string;
}

/** Protection-posture timeline for a target (real persisted scans only). */
export function HistoryPanel({ target, isDemo }: { target: string; isDemo: boolean }) {
  const tr = useTranslator();
  const u = (key: Parameters<typeof tr.t<"ui">>[1], values?: Record<string, string | number>) => tr.t("ui", key, values);
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
      <div className="mono mb-2 flex items-center justify-between text-[12px] uppercase tracking-wider text-ink-faint">
        <span>{u("historyTitle")}</span>
        <span>{u("scanCount", { count: scans.length })}{durable ? "" : ` · ${u("session")}`}</span>
      </div>
      <div className="panel p-3">
        <div className="flex h-16 items-end gap-1">
          {ordered.map((s) => {
            const h = Math.max(4, (s.score / max) * 100);
            const color = s.score >= 80 ? "#38e1c3" : s.score >= 60 ? "#5b8cff" : s.score >= 40 ? "#f5c451" : "#ff8a5b";
            return (
              <div key={s.id} className="group relative flex-1" title={u("historyPoint", { date: tr.formatDate(s.finishedAt, { dateStyle: "medium", timeStyle: "short" }), score: s.score, assets: s.assets })}>
                <div className="w-full rounded-t" style={{ height: `${h}%`, background: color, opacity: 0.85 }} />
              </div>
            );
          })}
        </div>
        <div className="mono mt-2 flex justify-between text-[11px] text-ink-faint">
          <span>{tr.formatDate(ordered[0]!.finishedAt)}</span>
          <span>{u("latest")} {ordered[ordered.length - 1]!.score}/100</span>
        </div>
        <table className="sr-only">
          <caption>{u("historyFor", { target })}</caption>
          <thead><tr><th>{u("date")}</th><th>{u("protectionPosture")}</th><th>{u("assets")}</th></tr></thead>
          <tbody>{ordered.map((scan) => <tr key={scan.id}><td>{tr.formatDate(scan.finishedAt, { dateStyle: "medium", timeStyle: "short" })}</td><td>{scan.score} {u("outOf100")}</td><td>{scan.assets}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
