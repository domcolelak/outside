import type { Assurance, Priority } from "@/lib/types";
export { PRIORITY_STYLE } from "@/lib/analysis/priority";
import { PRIORITY_STYLE } from "@/lib/analysis/priority";

export function PriorityDot({ priority, size = 8 }: { priority: Priority; size?: number }) {
  const c = PRIORITY_STYLE[priority].color;
  return (
    <span
      className="inline-block rounded-full"
      style={{ width: size, height: size, background: c, boxShadow: `0 0 10px ${c}66` }}
    />
  );
}

export function Chip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "signal" | "warn" }) {
  const tones: Record<string, string> = {
    neutral: "border-line text-ink-soft",
    signal: "border-signal/30 text-signal",
    warn: "border-risk-high/40 text-risk-high",
  };
  return (
    <span className={`mono inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] ${tones[tone]}`}>
      {children}
    </span>
  );
}

const ASSURANCE_LABEL: Record<Assurance, { label: string; tone: string }> = {
  observed: { label: "Observed fact", tone: "text-signal border-signal/30" },
  inferred: { label: "Inferred signal", tone: "text-risk-medium border-risk-medium/30" },
  possible: { label: "Possible risk", tone: "text-risk-high border-risk-high/30" },
};

export function AssuranceTag({ assurance }: { assurance: Assurance }) {
  const a = ASSURANCE_LABEL[assurance];
  return <span className={`mono rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${a.tone}`}>{a.label}</span>;
}

export function Confidence({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  const explanation = `${pct}% deterministic confidence. This expresses evidence strength, not exploitability or proof of compromise.`;
  return (
    <span className="mono inline-flex items-center gap-1.5 text-[11px] text-ink-soft" title={explanation} aria-label={explanation}>
      <span className="relative inline-block h-1.5 w-12 overflow-hidden rounded-full bg-base-700">
        <span className="absolute inset-y-0 left-0 rounded-full bg-signal" style={{ width: `${pct}%` }} />
      </span>
      {pct}%
    </span>
  );
}
