"use client";

import { useMemo, useState } from "react";
import type { ScanResult } from "@/lib/types";
import type { ChangeProposal, Recommendation, RecommendationStatus } from "@/lib/aegis/types";
import { PriorityDot } from "@/components/ui";

const CATEGORY_LABEL: Record<string, string> = {
  mail_security: "Mail security",
  security_headers: "Security headers",
  certificate_lifecycle: "Certificate",
  non_production_exposure: "Non-production",
  shadow_asset: "Shadow asset",
  auth_surface: "Auth surface",
  api_surface: "API surface",
  third_party: "Third-party",
  surface_change: "Surface change",
};

const OPEN: RecommendationStatus[] = ["open", "acknowledged", "in_progress"];

export function ProtectionPanel({ result, onSelectAsset }: { result: ScanResult; onSelectAsset: (id: string) => void }) {
  const posture0 = result.posture;
  const [recs, setRecs] = useState<Recommendation[]>(posture0?.recommendations ?? []);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const current = posture0?.currentScore ?? 0;
  const potential = useMemo(() => {
    const openReduction = recs.filter((r) => OPEN.includes(r.status)).reduce((s, r) => s + r.estimatedReduction, 0);
    return Math.max(0, Math.min(100, current + openReduction));
  }, [recs, current]);

  if (!posture0 || recs.length === 0) return null;

  const gain = potential - current;
  const openCount = recs.filter((r) => OPEN.includes(r.status)).length;

  const setStatus = async (rec: Recommendation, status: RecommendationStatus) => {
    const previous = rec.status;
    setUpdateError(null);
    setRecs((list) => list.map((r) => (r.id === rec.id ? { ...r, status } : r)));
    if (result.isDemo) return;
    try {
      const response = await fetch("/api/recommendations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ target: result.target, recId: rec.id, status }),
      });
      if (!response.ok) throw new Error(`Recommendation update failed (${response.status})`);
    } catch {
      setRecs((list) => list.map((r) => (r.id === rec.id ? { ...r, status: previous } : r)));
      setUpdateError("The workflow update could not be saved. The previous status was restored.");
    }
  };

  return (
    <div>
      <div className="mono mb-2 flex items-center justify-between text-[11px] uppercase tracking-wider text-ink-faint">
        <span className="text-signal">Aegis · remediation planning</span>
        <span>{openCount} open</span>
      </div>

      {updateError && <p role="alert" className="mono mb-3 rounded-lg border border-risk-high/30 bg-risk-high/5 px-3 py-2 text-[10px] text-risk-high">{updateError}</p>}

      {/* Posture: current -> potential score */}
      <div className="panel mb-3 p-4">
        <div className="flex items-end justify-between">
          <div>
            <div className="mono text-[10px] uppercase tracking-wide text-ink-faint">Protection posture</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-ink">{current}</span>
              {gain > 0 && (
                <>
                  <span className="text-ink-faint">→</span>
                  <span className="text-2xl font-semibold text-signal">{potential}</span>
                  <span className="mono text-xs text-signal">+{gain}</span>
                </>
              )}
            </div>
          </div>
          <div className="mono text-right text-[10px] uppercase tracking-wide text-ink-faint">
            {gain > 0 ? "Potential\nif resolved" : "Well\ncontained"}
          </div>
        </div>
        <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-base-700">
          <div className="absolute inset-y-0 left-0 rounded-full bg-ink-soft/40" style={{ width: `${current}%` }} />
          <div className="absolute inset-y-0 rounded-full bg-signal/70" style={{ left: `${current}%`, width: `${gain}%` }} />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-ink-soft">{posture0.summary}</p>
      </div>

      <div className="space-y-2">
        {recs.map((rec) => (
          <RecCard key={rec.id} rec={rec} onSelectAsset={onSelectAsset} onStatus={setStatus} />
        ))}
      </div>
    </div>
  );
}

function RecCard({
  rec,
  onSelectAsset,
  onStatus,
}: {
  rec: Recommendation;
  onSelectAsset: (id: string) => void;
  onStatus: (rec: Recommendation, status: RecommendationStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const resolved = rec.status === "resolved";
  const dismissed = rec.status === "dismissed";
  const muted = resolved || dismissed;

  return (
    <div className={`panel overflow-hidden ${muted ? "opacity-60" : ""}`}>
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-base-700/40">
        <PriorityDot priority={rec.priority} />
        <div className="min-w-0 flex-1">
          <div className={`text-[13px] text-ink ${resolved ? "line-through decoration-signal/60" : ""}`}>{rec.title}</div>
          <div className="mono mt-0.5 text-[11px] text-ink-faint">
            {CATEGORY_LABEL[rec.category] ?? rec.category}
            {rec.status !== "open" && <span className="ml-1 text-signal">· {rec.status.replace("_", " ")}</span>}
          </div>
        </div>
        {rec.estimatedReduction > 0 && !muted && (
          <span className="mono shrink-0 rounded-md border border-signal/30 bg-signal/10 px-1.5 py-0.5 text-[10px] text-signal">+{rec.estimatedReduction}</span>
        )}
      </button>

      {open && (
        <div className="space-y-3 border-t border-line px-3 py-3 text-xs">
          <Field label="Why">{rec.why}</Field>
          <Field label="Business impact">{rec.businessImpact}</Field>
          {rec.evidence.length > 0 && (
            <div>
              <div className="mono text-[10px] uppercase tracking-wide text-ink-faint">Evidence</div>
              {rec.evidence.map((e, i) => (
                <div key={i} className="mono mt-1 text-[11px] text-ink-soft">
                  <span className="text-signal">{e.provider}</span> · {e.summary}
                </div>
              ))}
            </div>
          )}

          <div className="rounded-lg border border-line bg-base-850 p-3">
            <div className="mono mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-ink-faint">
              <span>Remediation · guided</span>
              {rec.remediation.connector && <span className="rounded-sm border border-line px-1.5 py-0.5 text-ink-soft">connector: {rec.remediation.connector}</span>}
            </div>
            <p className="text-ink-soft">{rec.remediation.summary}</p>
            <ol className="mt-2 space-y-1.5">
              {rec.remediation.steps.map((s, i) => (
                <li key={i} className="flex gap-2 text-ink-soft">
                  <span className="mono text-signal">{i + 1}.</span>
                  <span>
                    {s.instruction}
                    {s.detail && <span className="mono mt-0.5 block text-[10px] text-ink-faint">{s.detail}</span>}
                  </span>
                </li>
              ))}
            </ol>
            {rec.remediation.rollback && (
              <p className="mono mt-2 text-[10px] text-ink-faint">↩ Rollback: {rec.remediation.rollback}</p>
            )}
            {rec.remediation.proposal && <ProposalPreview proposal={rec.remediation.proposal} />}
            {rec.remediation.changesInfrastructure && (
              <p className="mono mt-1 text-[10px] text-risk-medium">Applying this changes live infrastructure — always preview & approve first.</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {!resolved && (
              <button onClick={() => onStatus(rec, "resolved")} className="mono rounded-md border border-signal/30 bg-signal/10 px-2.5 py-1 text-[11px] text-signal hover:bg-signal/20">
                Mark resolved
              </button>
            )}
            {rec.status === "open" && (
              <button onClick={() => onStatus(rec, "in_progress")} className="mono rounded-md border border-line px-2.5 py-1 text-[11px] text-ink-soft hover:bg-base-700">
                Start
              </button>
            )}
            {!dismissed && !resolved && (
              <button onClick={() => onStatus(rec, "dismissed")} className="mono rounded-md border border-line px-2.5 py-1 text-[11px] text-ink-faint hover:bg-base-700">
                Dismiss
              </button>
            )}
            {muted && (
              <button onClick={() => onStatus(rec, "open")} className="mono rounded-md border border-line px-2.5 py-1 text-[11px] text-ink-soft hover:bg-base-700">
                Reopen
              </button>
            )}
            {rec.assetIds[0] && (
              <button onClick={() => onSelectAsset(rec.assetIds[0]!)} className="mono ml-auto text-[11px] text-signal hover:underline">
                View asset →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ProposalPreview({ proposal }: { proposal: ChangeProposal }) {
  const [copied, setCopied] = useState(false);
  const text =
    proposal.format === "dns_records"
      ? (proposal.dnsRecords ?? []).map((r) => `${r.name}\t${r.type}\t${r.value}`).join("\n")
      : proposal.format === "http_headers"
        ? (proposal.headers ?? []).map((h) => `${h.name}: ${h.value}`).join("\n")
        : proposal.text ?? "";
  const copy = () => {
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="mt-2 rounded-md border border-signal/20 bg-base-950 p-2.5">
      <div className="mono mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-wide">
        <span className="text-signal">Proposed change · never auto-applied</span>
        <span className="flex items-center gap-2">
          <span className={proposal.validation.ok ? "text-signal" : "text-risk-medium"}>
            {proposal.validation.ok ? "✓ validated in-scope" : "⚠ review"}
          </span>
          <button onClick={copy} className="rounded-sm border border-line px-1.5 py-0.5 text-ink-soft hover:bg-base-700">{copied ? "copied" : "copy"}</button>
        </span>
      </div>
      <pre className="scroll-thin overflow-x-auto whitespace-pre text-[11px] leading-relaxed text-ink-soft">{text}</pre>
      {!proposal.validation.ok && (
        <ul className="mono mt-1 space-y-0.5 text-[10px] text-risk-medium">
          {proposal.validation.issues.map((iss, i) => <li key={i}>· {iss}</li>)}
        </ul>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mono text-[10px] uppercase tracking-wide text-ink-faint">{label}</div>
      <p className="mt-0.5 leading-relaxed text-ink-soft">{children}</p>
    </div>
  );
}
