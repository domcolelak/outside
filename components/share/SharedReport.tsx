import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";
import type { ShareSnapshot } from "@/lib/share/shares";

const BAND_LABEL: Record<string, string> = { guarded: "Guarded", moderate: "Moderate", elevated: "Elevated", exposed: "Exposed" };
const BAND_COLOR: Record<string, string> = { guarded: "text-signal", moderate: "text-risk-medium", elevated: "text-risk-high", exposed: "text-risk-critical" };
const PRIORITY_COLOR: Record<string, string> = { critical: "text-risk-critical", high: "text-risk-high", medium: "text-risk-medium", low: "text-signal", info: "text-ink-faint" };

function Cta() {
  return (
    <div className="premium-surface relative overflow-hidden p-7 text-center md:p-10">
      <div className="hero-orb absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full" />
      <div className="relative">
        <h2 className="display-type text-2xl font-semibold tracking-tight text-gradient md:text-3xl">See your own external surface</h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-soft">Run a free passive scan of any domain, then monitor it continuously — OUTSIDE alerts you when your public exposure changes.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/" className="rounded-xl bg-signal px-6 py-3 text-sm font-semibold text-base-950 shadow-glow">Scan my company — free</Link>
          <Link href="/login?mode=signup" className="rounded-xl border border-line px-6 py-3 text-sm text-ink-soft hover:bg-base-800">Start monitoring</Link>
        </div>
      </div>
    </div>
  );
}

export function SharedReport({ snapshot }: { snapshot: ShareSnapshot | null }) {
  if (!snapshot) {
    return (
      <div className="grid min-h-screen place-items-center px-6">
        <div className="max-w-sm text-center">
          <Wordmark className="mx-auto h-7" />
          <h1 className="mt-8 text-xl font-semibold text-ink">This report has expired</h1>
          <p className="mt-2 text-sm text-ink-soft">Shared reports are available for 30 days. Run a fresh scan to see the current picture.</p>
          <Link href="/" className="mt-6 inline-block rounded-xl bg-signal px-6 py-3 text-sm font-semibold text-base-950 shadow-glow">Run a free scan</Link>
        </div>
      </div>
    );
  }

  const s = snapshot;
  const stat = [
    ["External assets", s.stats.assets],
    ["Web / API surfaces", s.stats.webSurfaces],
    ["Shadow signals", s.stats.shadowAssets],
    ["High-priority", s.stats.highPriorityFindings],
  ] as const;

  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link href="/"><Wordmark className="h-6" /></Link>
          <span className="mono text-[10px] uppercase tracking-[.18em] text-ink-faint">Shared exposure report</span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-8 px-6 py-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mono text-[11px] uppercase tracking-widest text-signal">External exposure</div>
            <h1 className="mt-2 break-all text-3xl font-semibold text-ink">{s.target}</h1>
            {s.isDemo && <p className="mono mt-1 text-[11px] text-ink-faint">Demo dataset — synthetic organization</p>}
          </div>
          <div className="panel flex items-center gap-5 p-5">
            <div className="text-right">
              <div className="text-5xl font-semibold tracking-tight text-ink" style={{ fontVariantNumeric: "tabular-nums" }}>{s.score.value}</div>
              <div className="mono text-[10px] uppercase tracking-wider text-ink-faint">/ 100</div>
            </div>
            <div className="h-10 w-px bg-line" />
            <div>
              <div className="mono text-[10px] uppercase tracking-wider text-ink-faint">Posture</div>
              <div className={`text-lg font-semibold ${BAND_COLOR[s.score.band] ?? "text-ink"}`}>{BAND_LABEL[s.score.band] ?? s.score.band}</div>
            </div>
          </div>
        </div>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {stat.map(([label, value]) => (
            <div key={label} className="panel p-4">
              <div className="text-2xl font-semibold text-ink" style={{ fontVariantNumeric: "tabular-nums" }}>{value}</div>
              <div className="mono mt-1 text-[10px] uppercase tracking-wider text-ink-faint">{label}</div>
            </div>
          ))}
        </section>

        {s.findings.length > 0 && (
          <section>
            <div className="mono mb-3 text-[11px] uppercase tracking-wider text-ink-faint">Findings ({s.findings.length})</div>
            <div className="space-y-2">
              {s.findings.map((f, i) => (
                <div key={i} className="panel p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-ink">{f.title}</span>
                    <span className={`mono text-[10px] uppercase tracking-wider ${PRIORITY_COLOR[f.priority] ?? "text-ink-faint"}`}>{f.priority} · {Math.round(f.confidence * 100)}%</span>
                  </div>
                  <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">{f.observation} {f.concern}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <p className="mono text-[11px] leading-relaxed text-ink-faint">
          Generated from passive, public sources only (Certificate Transparency, DNS). Findings separate observed facts from inference and are prioritized items to review, never confirmed exploitation.
        </p>

        <Cta />
      </main>
    </div>
  );
}
