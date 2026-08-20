"use client";

import { useState } from "react";
import type { ScanResult } from "@/lib/types";
import type { ExposureIncident } from "@/lib/aegis/investigation";
import { PriorityDot } from "@/components/ui";
import { useTranslator } from "@/lib/i18n/context";
import { localizeInvestigationAssessment, localizeInvestigationIncident } from "@/lib/aegis/localize";

/**
 * Aegis investigation: correlated exposure incidents + an assessment that always
 * reports contradicting evidence (the Devil's Advocate, ported from Aegis AI).
 */
export function InvestigationPanel({ result }: { result: ScanResult }) {
  const tr = useTranslator();
  const u = (key: Parameters<typeof tr.t<"ui">>[1], values?: Record<string, string | number>) => tr.t("ui", key, values);
  const inv = result.investigation;
  if (!inv || inv.incidents.length === 0) return null;
  const top = inv.incidents[0]!;
  const assessment = inv.assessment;
  const topCopy = localizeInvestigationIncident(top, result, tr);
  const assessmentCopy = assessment ? localizeInvestigationAssessment(assessment, top, result, tr) : null;

  return (
    <div>
      <div className="mono mb-2 flex items-center justify-between text-[12px] uppercase tracking-wider text-ink-faint">
        <span className="text-signal">{u("investigationKicker")}</span>
        <span>{u("incidentCount", { count: inv.incidents.length })}</span>
      </div>

      <div className="panel p-4">
        <div className="flex items-start gap-2.5">
          <PriorityDot priority={top.priority} />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] text-ink">{topCopy.title}</div>
            <div className="mono mt-0.5 text-[12px] text-ink-faint">
              {u("blastRadius")} {top.blastRadius} · {u("correlatedSignalsRank", { count: top.findingIds.length, rank: top.rank })}
            </div>
          </div>
        </div>

        {/* Correlation chain */}
        <div className="mt-3">
          <div className="mono text-[11px] uppercase tracking-wide text-ink-faint">{u("correlationChain")}</div>
          <ol className="mt-1.5 space-y-1">
            {topCopy.chain.map((step, i) => (
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
                <span>{u("assessment")}</span>
                <span className="text-ink-soft">{u("confidencePercent", { value: Math.round(assessment.confidence * 100) })}</span>
              </div>
              <p className="text-[12px] leading-relaxed text-ink-soft">{assessmentCopy?.hypothesis}</p>
            </div>

            {/* Devil's Advocate — always shown, honesty by construction */}
            <div className="rounded-lg border border-risk-medium/25 bg-risk-medium/5 p-2.5">
              <div className="mono mb-1 text-[11px] uppercase tracking-wide text-risk-medium">{u("counterEvidence")}</div>
              <ul className="space-y-1">
                {assessmentCopy?.contradicting.map((c, i) => (
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
          <MoreIncidents incidents={inv.incidents.slice(1)} result={result} />
        )}
      </div>
    </div>
  );
}

function MoreIncidents({ incidents, result }: { incidents: ExposureIncident[]; result: ScanResult }) {
  const tr = useTranslator();
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 border-t border-line pt-3">
      <button onClick={() => setOpen((v) => !v)} className="mono text-[12px] text-signal hover:underline">
        {open ? tr.t("ui", "hide") : tr.t("ui", "moreIncidents", { count: incidents.length })}
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          {incidents.map((inc) => (
            <div key={inc.id} className="flex items-center gap-2 text-[12px] text-ink-soft">
              <PriorityDot priority={inc.priority} size={6} />
              <span className="flex-1 truncate">{localizeInvestigationIncident(inc, result, tr).title}</span>
              <span className="mono text-ink-faint">×{inc.blastRadius}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
