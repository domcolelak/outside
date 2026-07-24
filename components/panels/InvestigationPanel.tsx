"use client";

import { useState } from "react";
import type { ScanResult } from "@/lib/types";
import type { ExposureIncident } from "@/lib/aegis/investigation";
import { PriorityDot } from "@/components/ui";

/**
 * Aegis investigation: correlated exposure incidents + an assessment that always
 * reports contradicting evidence (the Devil's Advocate, ported from Aegis AI).
 */
export function InvestigationPanel({ result }: { result: ScanResult }) {
  const inv = result.investigation;
  if (!inv || inv.incidents.length === 0) return null;
  const top = inv.incidents[0]!;
  const assessment = inv.assessment;

  return (
    <div>
      <div className="mono mb-2 flex items-center justify-between text-[12px] uppercase tracking-wider text-ink-faint">
        <span className="text-signal">Aegis · investigation</span>
        <span>{inv.incidents.length} incident{inv.incidents.length > 1 ? "s" : ""}</span>
      </div>

      <div className="panel p-4">
        <div className="flex items-start gap-2.5">
          <PriorityDot priority={top.priority} />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] text-ink">{top.title}</div>
            <div className="mono mt-0.5 text-[12px] text-ink-faint">
              blast radius {top.blastRadius} · {top.findingIds.length} correlated signals · rank {top.rank}
            </div>
          </div>
        </div>

        {/* Correlation chain */}
        <div className="mt-3">
          <div className="mono text-[11px] uppercase tracking-wide text-ink-faint">Correlation chain</div>
          <ol className="mt-1.5 space-y-1">
            {top.chain.map((step, i) => (
              <li key={i} className="flex gap-2 text-[12px] leading-snug text-ink-soft">
                <span className="mono text-signal">{i === 0 ? "▶" : "↳"}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>

        {assessment && (
          <div className="mt-3 space-y-3 border-t border-line pt-3">
            <div>
              <div className="mono mb-1 flex items-center justify-between text-[11px] uppercase tracking-wide text-ink-faint">
                <span>Assessment</span>
                <span className="text-ink-soft">{Math.round(assessment.confidence * 100)}% confidence</span>
              </div>
              <p className="text-[12px] leading-relaxed text-ink-soft">{assessment.hypothesis}</p>
            </div>

            {/* Devil's Advocate — always shown, honesty by construction */}
            <div className="rounded-lg border border-risk-medium/25 bg-risk-medium/5 p-2.5">
              <div className="mono mb-1 text-[11px] uppercase tracking-wide text-risk-medium">Counter-evidence (Devil&apos;s Advocate)</div>
              <ul className="space-y-1">
                {assessment.contradictingEvidence.map((c, i) => (
                  <li key={i} className="flex gap-2 text-[12px] leading-snug text-ink-soft">
                    <span className="text-risk-medium">·</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {inv.incidents.length > 1 && (
          <MoreIncidents incidents={inv.incidents.slice(1)} />
        )}
      </div>
    </div>
  );
}

function MoreIncidents({ incidents }: { incidents: ExposureIncident[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 border-t border-line pt-3">
      <button onClick={() => setOpen((v) => !v)} className="mono text-[12px] text-signal hover:underline">
        {open ? "Hide" : `${incidents.length} more correlated incident${incidents.length > 1 ? "s" : ""}`}
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          {incidents.map((inc) => (
            <div key={inc.id} className="flex items-center gap-2 text-[12px] text-ink-soft">
              <PriorityDot priority={inc.priority} size={6} />
              <span className="flex-1 truncate">{inc.title}</span>
              <span className="mono text-ink-faint">×{inc.blastRadius}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
