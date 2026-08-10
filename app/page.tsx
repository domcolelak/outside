import Link from "next/link";
import { HeroInput } from "@/components/HeroInput";
import { HeroBackdrop } from "@/components/HeroBackdrop";
import { Wordmark } from "@/components/Wordmark";
import { LandingDemo } from "@/components/experience/LandingDemo";
import { NavAuthLink } from "@/components/NavAuthLink";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { currentLocale } from "@/lib/i18n/server";
import { getTranslator } from "@/lib/i18n/messages";

export default async function Landing() {
  // Copy comes from reviewed catalogs, never from a translation call at request
  // time: the sentences a prospect reads must be the same on every visit.
  const { locale } = await currentLocale();
  const t = getTranslator(locale);
  const m = (key: Parameters<typeof t.t<"landing">>[1]) => t.t("landing", key);

  return (
    <div className="relative">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-line/60 bg-base-950/70 backdrop-blur-md">
        {/* Wraps rather than overflows: Hungarian and Czech labels are wider
            than the English ones and pushed the controls off a 390px screen. */}
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-y-2 px-4 py-4 sm:px-6">
          <Wordmark className="h-6" />
          <nav className="hidden items-center gap-7 text-sm text-ink-soft md:flex">
            <a href="#how" className="hover:text-ink">{m("navHow")}</a>
            <a href="#features" className="hover:text-ink">{m("navFeatures")}</a>
            <a href="#intelligence" className="hover:text-ink">{m("navIntelligence")}</a>
            <a href="#guardian" className="hover:text-ink">{m("navGuardian")}</a>
            <a href="#security" className="hover:text-ink">{m("navResponsible")}</a>
            <a href="#pricing" className="hover:text-ink">{m("navPricing")}</a>
          </nav>
          {/* The controls wrap among themselves too: Hungarian needs more width
              for these three than a 390px screen has. */}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {/* A visitor has to be able to choose a language before signing up,
                not only after. */}
            <LanguageSwitcher current={locale} label={t.t("common", "changeLanguage")} />
            <NavAuthLink />
            <Link href="/scan?target=northstar&mode=demo" className="mono whitespace-nowrap rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink hover:bg-base-700 sm:px-3">
              {m("navWatchDemo")}
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative min-h-[760px] overflow-hidden">
        <div className="absolute inset-0 opacity-35"><HeroBackdrop /></div>
        <div className="grid-backdrop pointer-events-none absolute inset-0" />
        <div className="hero-orb pointer-events-none absolute left-[18%] top-20 h-[520px] w-[520px] rounded-full" />
        <div className="relative mx-auto grid max-w-[1380px] gap-16 px-6 pb-24 pt-20 lg:grid-cols-[.9fr_1.1fr] lg:items-center lg:pt-28">
          <div className="min-w-0 animate-rise-in">
            <span className="mono mb-7 inline-flex items-center gap-2 rounded-full border border-signal/20 bg-signal/4 px-3 py-1.5 text-[11px] uppercase tracking-[.2em] text-signal">
              <span className="relative flex h-1.5 w-1.5"><span className="absolute h-full w-full animate-ping rounded-full bg-signal opacity-30"/><span className="relative h-1.5 w-1.5 rounded-full bg-signal"/></span> {m("heroBadge")}
            </span>
            <h1 className="display-type max-w-3xl text-4xl font-semibold leading-[.98] tracking-[-.045em] text-ink sm:text-5xl md:text-7xl">
              {m("heroTitle")} <span className="text-gradient">{m("heroTitleAccent")}</span>
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-ink-soft">
              {m("heroBody")}
            </p>
            <div className="mt-9"><HeroInput /></div>
            <div className="mt-8 grid max-w-xl grid-cols-3 gap-4 border-t border-line pt-5">{[[m("heroStatPassive"), m("heroStatPassiveLabel")], [m("heroStatTraceable"), m("heroStatTraceableLabel")], [m("heroStatContinuous"), m("heroStatContinuousLabel")]].map(([value, label]) => <div key={value}><div className="text-sm font-medium text-ink">{value}</div><div className="mono mt-1 text-[10px] uppercase tracking-wider text-ink-faint">{label}</div></div>)}</div>
          </div>
          <div className="min-w-0 animate-rise-in [animation-delay:180ms]"><LandingDemo /></div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-linear-to-t from-base-950 to-transparent"/>
      </section>

      {/* Guardian */}
      <section id="guardian" className="relative overflow-hidden border-t border-line/60">
        <div className="grid-backdrop pointer-events-none absolute inset-0 opacity-40" />
        <div className="relative mx-auto grid max-w-6xl gap-12 px-6 py-28 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
          <div>
            <div className="mono inline-flex items-center gap-2 rounded-full border border-signal/20 bg-signal/5 px-3 py-1.5 text-[11px] uppercase tracking-[.18em] text-signal"><span className="relative flex h-2 w-2"><span className="absolute h-full w-full animate-ping rounded-full bg-signal opacity-30"/><span className="relative h-2 w-2 rounded-full bg-signal"/></span>{m("guardianKicker")}</div>
            <h2 className="mt-6 text-4xl font-semibold tracking-tight text-ink">{m("guardianTitle")}<br/><span className="text-gradient">{m("guardianTitleAccent")}</span></h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-ink-soft">{m("guardianBody")}</p>
            <div className="mt-7 flex flex-wrap gap-2">{[m("guardianChipDrift"), m("guardianChipChecklist"), m("guardianChipRemediation"), m("guardianChipDigest"), m("guardianChipWorkflow")].map((item) => <span key={item} className="mono rounded-full border border-line bg-base-900/70 px-3 py-1.5 text-[11px] text-ink-soft">{item}</span>)}</div>
          </div>
          <div className="premium-surface relative overflow-hidden p-5 md:p-7">
            <div className="mono mb-4 inline-flex rounded-sm border border-accent/20 bg-accent/5 px-2 py-1 text-[10px] uppercase tracking-wider text-accent">{m("guardianSampleLabel")}</div>
            <div className="absolute right-5 top-5 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-signal shadow-glow"/><span className="mono text-[11px] uppercase text-signal">{m("guardianSampleWatching")}</span></div>
            <div className="mono text-[11px] uppercase tracking-[.18em] text-ink-faint">{m("guardianSampleDrift")}</div>
            <div className="mt-3 text-2xl font-medium text-ink">{m("guardianSampleHeadline")} <span className="text-signal">{m("guardianSampleHeadlineAccent")}</span></div>
            <svg viewBox="0 0 400 120" className="mt-8 w-full" aria-hidden><defs><linearGradient id="landing-guardian" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#38e1c3" stopOpacity=".25"/><stop offset="1" stopColor="#38e1c3" stopOpacity="0"/></linearGradient></defs><path d="M0 90 C55 82, 80 95, 125 72 S210 68, 250 47 S335 55, 400 24 L400 120 L0 120Z" fill="url(#landing-guardian)"/><path d="M0 90 C55 82, 80 95, 125 72 S210 68, 250 47 S335 55, 400 24" fill="none" stroke="#38e1c3" strokeWidth="2"/></svg>
            <div className="mt-4 grid grid-cols-3 gap-2">{[["+3", m("guardianSampleNewAssets")], ["2", m("guardianSampleReviewItems")], ["8/10", m("guardianSampleControls")]].map(([value, label]) => <div key={label} className="rounded-lg border border-line bg-base-950/70 p-3"><div className="text-lg font-semibold text-ink">{value}</div><div className="mono mt-1 text-[10px] uppercase text-ink-faint">{label}</div></div>)}</div>
            <div className="mt-3 rounded-lg border border-risk-medium/15 bg-risk-medium/5 p-3"><div className="mono text-[10px] uppercase text-risk-medium">{m("guardianSampleReview")}</div><div className="mt-1 text-xs text-ink-soft">{m("guardianSampleReviewBody")}</div></div>
          </div>
        </div>
      </section>

      {/* Problem / concept */}
      <section className="border-t border-line/60 bg-base-900/40">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid gap-10 md:grid-cols-3">
            <Concept n="01" title={m("conceptOneTitle")} body={m("conceptOneBody")} />
            <Concept n="02" title={m("conceptTwoTitle")} body={m("conceptTwoBody")} />
            <Concept n="03" title={m("conceptThreeTitle")} body={m("conceptThreeBody")} />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl px-6 py-20">
        <SectionTitle kicker={m("howKicker")} title={m("howTitle")} />
        <div className="mt-12 grid gap-4 md:grid-cols-4">
          {[
            { s: m("howDiscover"), d: m("howDiscoverBody") },
            { s: m("howCorrelate"), d: m("howCorrelateBody") },
            { s: m("howClassify"), d: m("howClassifyBody") },
            { s: m("howExplain"), d: m("howExplainBody") },
          ].map((x, i) => (
            <div key={x.s} className="panel p-5">
              <div className="mono text-signal">{String(i + 1).padStart(2, "0")}</div>
              <div className="mt-3 text-lg text-ink">{x.s}</div>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{x.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-line/60 bg-base-900/40">
        <div className="mx-auto max-w-6xl space-y-4 px-6 py-20">
          <SectionTitle kicker={m("featuresKicker")} title={m("featuresTitle")} />
          <div className="mt-8 grid gap-4 md:grid-cols-6">
            <Feature className="md:col-span-4" title={m("featureAttackerView")} body={m("featureAttackerViewBody")} tone="signal" />
            <Feature className="md:col-span-2" title={m("featureShadowAssets")} body={m("featureShadowAssetsBody")} />
            <Feature className="md:col-span-2" title={m("featureChange")} body={m("featureChangeBody")} />
            <Feature className="md:col-span-4" title={m("featurePosture")} body={m("featurePostureBody")} />
          </div>
        </div>
      </section>

      {/* Intelligence layers */}
      <section id="intelligence" className="mx-auto max-w-6xl px-6 py-20">
        <SectionTitle kicker={m("intelligenceKicker")} title={m("intelligenceTitle")} />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            { t: m("intelligenceCve"), d: m("intelligenceCveBody") },
            { t: m("intelligenceEnrichment"), d: m("intelligenceEnrichmentBody") },
            { t: m("intelligenceChronos"), d: m("intelligenceChronosBody") },
            { t: m("intelligenceTwin"), d: m("intelligenceTwinBody") },
            { t: m("intelligenceCapabilities"), d: m("intelligenceCapabilitiesBody") },
            { t: m("intelligenceEvolution"), d: m("intelligenceEvolutionBody") },
          ].map((x) => (
            <div key={x.t} className="panel p-5">
              <div className="text-ink">{x.t}</div>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{x.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Security */}
      <section id="security" className="mx-auto max-w-6xl px-6 py-20">
        <SectionTitle kicker={m("securityKicker")} title={m("securityTitle")} />
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {[
            [m("securityPassive"), m("securityPassiveBody")],
            [m("securitySsrf"), m("securitySsrfBody")],
            [m("securityOwnership"), m("securityOwnershipBody")],
            [m("securityRateLimit"), m("securityRateLimitBody")],
          ].map(([t, d]) => (
            <div key={t} className="panel p-5">
              <div className="text-ink">{t}</div>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-line/60 bg-base-900/40">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <SectionTitle kicker={m("pricingKicker")} title={m("pricingTitle")} />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <Plan name={m("planSnapshot")} price={m("planSnapshotPrice")} cadence={m("planSnapshotCadence")} popular={m("pricingPopular")} cta={{ label: m("planSnapshotCta"), href: "/login" }} features={[m("planSnapshotFeature1"), m("planSnapshotFeature2"), m("planSnapshotFeature3"), m("planSnapshotFeature4")]} />
            <Plan name={m("planProfessional")} price="$79" cadence={m("planProfessionalCadence")} popular={m("pricingPopular")} highlight cta={{ label: m("planProfessionalCta"), href: "/login?next=/billing" }} features={[m("planProfessionalFeature1"), m("planProfessionalFeature2"), m("planProfessionalFeature3"), m("planProfessionalFeature4"), m("planProfessionalFeature5"), m("planProfessionalFeature6")]} />
            <Plan name={m("planAgency")} price="$249" cadence={m("planAgencyCadence")} popular={m("pricingPopular")} cta={{ label: m("planAgencyCta"), href: "/login?next=/billing" }} features={[m("planAgencyFeature1"), m("planAgencyFeature2"), m("planAgencyFeature3"), m("planAgencyFeature4"), m("planAgencyFeature5")]} />
          </div>
          <p className="mono mt-6 text-center text-xs text-ink-faint">
            {m("pricingNote")}
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-6 py-24 text-center">
        <h2 className="text-4xl font-semibold tracking-tight text-ink">{m("ctaTitle")}</h2>
        <p className="mx-auto mt-4 max-w-lg text-ink-soft">{m("ctaBody")}</p>
        <div className="mt-8 flex flex-col items-center"><HeroInput /></div>
      </section>

      <footer className="border-t border-line/60">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div>
              <Wordmark className="h-5" />
              <p className="mono mt-3 max-w-xs text-xs leading-5 text-ink-faint">{m("footerTagline")}</p>
            </div>
            <nav className="flex flex-wrap gap-x-8 gap-y-2 text-sm text-ink-soft">
              <a href="#how" className="hover:text-ink">{m("navHow")}</a>
              <a href="#features" className="hover:text-ink">{m("navFeatures")}</a>
              <a href="#pricing" className="hover:text-ink">{m("navPricing")}</a>
              <a href="#security" className="hover:text-ink">{m("navResponsible")}</a>
              <Link href="/login" className="hover:text-ink">{m("navSignIn")}</Link>
            </nav>
            <nav className="flex flex-wrap gap-x-8 gap-y-2 text-sm text-ink-soft">
              <Link href="/privacy" className="hover:text-ink">{m("footerPrivacy")}</Link>
              <Link href="/terms" className="hover:text-ink">{m("footerTerms")}</Link>
              <Link href="/security" className="hover:text-ink">{m("footerSecurity")}</Link>
              <a href="mailto:security@outsideguardian.eu" className="hover:text-ink">{m("footerReportVulnerability")}</a>
            </nav>
          </div>
          <div className="mono mt-8 border-t border-line/40 pt-6 text-[12px] leading-5 text-ink-faint">
            © {new Date().getFullYear()} VeDomEll s. r. o. · Alžbetina 55, 040 01 Košice, Slovakia · IČO 52498751
          </div>
        </div>
      </footer>
    </div>
  );
}

function SectionTitle({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div>
      <div className="mono text-[12px] uppercase tracking-widest text-signal">{kicker}</div>
      <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-ink md:text-4xl">{title}</h2>
    </div>
  );
}

function Concept({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div>
      <div className="mono text-sm text-signal">{n}</div>
      <div className="mt-3 text-xl text-ink">{title}</div>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">{body}</p>
    </div>
  );
}

function Feature({ title, body, className = "", tone = "neutral" }: { title: string; body: string; className?: string; tone?: "neutral" | "signal" }) {
  return (
    <div className={`panel relative overflow-hidden p-6 ${className}`}>
      {tone === "signal" && <div className="scan-sweep pointer-events-none absolute inset-0 opacity-40" />}
      <div className="relative">
        <div className="text-lg text-ink">{title}</div>
        <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-soft">{body}</p>
      </div>
    </div>
  );
}

function Plan({ name, price, cadence, features, cta, popular, highlight = false }: { name: string; price: string; cadence: string; features: string[]; cta: { label: string; href: string }; popular: string; highlight?: boolean }) {
  return (
    <div className={`panel flex flex-col p-6 ${highlight ? "ring-1 ring-signal/40" : ""}`}>
      <div className="flex items-center justify-between">
        <span className="text-ink">{name}</span>
        {highlight && <span className="mono rounded-md border border-signal/30 px-2 py-0.5 text-[11px] uppercase tracking-wider text-signal">{popular}</span>}
      </div>
      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-3xl font-semibold text-ink">{price}</span>
        <span className="mono text-xs text-ink-faint">{cadence}</span>
      </div>
      <ul className="mt-5 flex-1 space-y-2 text-sm text-ink-soft">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <span className="mt-0.5 text-signal">›</span>
            {f}
          </li>
        ))}
      </ul>
      <Link
        href={cta.href}
        className={`mono mt-6 block rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition ${highlight ? "bg-signal text-base-950 shadow-glow hover:bg-signal-bright" : "border border-line text-ink hover:bg-base-700"}`}
      >
        {cta.label}
      </Link>
    </div>
  );
}
