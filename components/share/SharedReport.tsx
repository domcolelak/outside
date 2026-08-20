import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";
import type { ShareSnapshot } from "@/lib/share/shares";
import { currentTranslator } from "@/lib/i18n/server";
import type { Translator } from "@/lib/i18n/messages";
import { findingText } from "@/lib/report/finding-text";
import type { Finding } from "@/lib/types";

const BAND_COLOR: Record<string, string> = { guarded: "text-signal", moderate: "text-risk-medium", elevated: "text-risk-high", exposed: "text-risk-critical" };
const PRIORITY_COLOR: Record<string, string> = { critical: "text-risk-critical", high: "text-risk-high", medium: "text-risk-medium", low: "text-signal", info: "text-ink-faint" };

function Cta({ t }: { t: Translator }) {
  return (
    <div className="premium-surface relative overflow-hidden p-7 text-center md:p-10">
      <div className="hero-orb absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full" />
      <div className="relative">
        <h2 className="display-type text-2xl font-semibold tracking-tight text-gradient md:text-3xl">{t.t("ui", "sharedCtaTitle")}</h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-soft">{t.t("ui", "sharedCtaBody")}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/" className="rounded-xl bg-signal px-6 py-3 text-sm font-semibold text-base-950 shadow-glow">{t.t("ui", "sharedCtaScan")}</Link>
          <Link href="/login?mode=signup" className="rounded-xl border border-line px-6 py-3 text-sm text-ink-soft hover:bg-base-800">{t.t("ui", "sharedCtaMonitor")}</Link>
        </div>
      </div>
    </div>
  );
}

export async function SharedReport({ snapshot }: { snapshot: ShareSnapshot | null }) {
  const t = await currentTranslator();
  if (!snapshot) {
    return (
      <div className="grid min-h-screen place-items-center px-6">
        <div className="max-w-sm text-center">
          <Wordmark className="mx-auto h-7" />
          <h1 className="mt-8 text-xl font-semibold text-ink">{t.t("ui", "sharedExpiredTitle")}</h1>
          <p className="mt-2 text-sm text-ink-soft">{t.t("ui", "sharedExpiredBody")}</p>
          <Link href="/" className="mt-6 inline-block rounded-xl bg-signal px-6 py-3 text-sm font-semibold text-base-950 shadow-glow">{t.t("ui", "sharedExpiredAction")}</Link>
        </div>
      </div>
    );
  }

  const s = snapshot;
  const stat = [
    [t.t("ui", "sharedStatAssets"), s.stats.assets],
    [t.t("ui", "sharedStatWeb"), s.stats.webSurfaces],
    [t.t("ui", "sharedStatShadow"), s.stats.shadowAssets],
    [t.t("ui", "sharedStatPriority"), s.stats.highPriorityFindings],
  ] as const;

  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link href="/"><Wordmark className="h-6" /></Link>
          <span className="mono text-[11px] uppercase tracking-[.18em] text-ink-faint">{t.t("ui", "sharedReportKicker")}</span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-8 px-6 py-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mono text-[12px] uppercase tracking-widest text-signal">{t.t("ui", "sharedExternalExposure")}</div>
            <h1 className="mt-2 break-all text-3xl font-semibold text-ink">{s.target}</h1>
            {s.isDemo && <p className="mono mt-1 text-[12px] text-ink-faint">{t.t("ui", "demoDataset")}</p>}
          </div>
          <div className="panel flex items-center gap-5 p-5">
            <div className="text-right">
              <div className="text-5xl font-semibold tracking-tight text-ink" style={{ fontVariantNumeric: "tabular-nums" }}>{s.score.value}</div>
              <div className="mono text-[11px] uppercase tracking-wider text-ink-faint">{t.t("ui", "higherIsBetter")}</div>
            </div>
            <div className="h-10 w-px bg-line" />
            <div>
              <div className="mono text-[11px] uppercase tracking-wider text-ink-faint">{t.t("ui", "protectionPosture")}</div>
              <div className={`text-lg font-semibold ${BAND_COLOR[s.score.band] ?? "text-ink"}`}>{t.t("ui", ({ guarded: "bandGuarded", moderate: "bandModerate", elevated: "bandElevated", exposed: "bandExposed" } as const)[s.score.band as "guarded" | "moderate" | "elevated" | "exposed"] ?? "bandModerate")}</div>
            </div>
          </div>
        </div>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {stat.map(([label, value]) => (
            <div key={label} className="panel p-4">
              <div className="text-2xl font-semibold text-ink" style={{ fontVariantNumeric: "tabular-nums" }}>{value}</div>
              <div className="mono mt-1 text-[11px] uppercase tracking-wider text-ink-faint">{label}</div>
            </div>
          ))}
        </section>

        {s.findings.length > 0 && (
          <section>
            <div className="mono mb-3 text-[12px] uppercase tracking-wider text-ink-faint">{t.t("ui", "findingsCount", { count: s.findings.length })}</div>
            <div className="space-y-2">
              {s.findings.map((f, i) => {
                const finding: Finding = {
                  ...f,
                  id: `shared-${i}`,
                  assetId: s.target,
                  category: "shared",
                  reasoning: "",
                  recommendation: "",
                  evidence: [],
                  discoveryMethod: "demo",
                  createdAt: s.createdAt,
                };
                const text = findingText(finding, t.locale);
                return (
                <div key={i} className="panel p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-ink">{text.title}</span>
                    <span className={`mono text-[11px] uppercase tracking-wider ${PRIORITY_COLOR[f.priority] ?? "text-ink-faint"}`}>{f.priority} · {Math.round(f.confidence * 100)}%</span>
                  </div>
                  <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">{text.observation} {text.concern}</p>
                </div>
              );})}
            </div>
          </section>
        )}

        <p className="mono text-[12px] leading-relaxed text-ink-faint">
          {t.t("ui", "sharedMethodology")}
        </p>

        <Cta t={t} />
      </main>
    </div>
  );
}
