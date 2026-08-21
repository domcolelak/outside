import Link from "next/link";
import { HeroInput } from "@/components/HeroInput";
import { Wordmark } from "@/components/Wordmark";
import { NavAuthLink } from "@/components/NavAuthLink";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { SupportExperience } from "@/components/support/SupportExperience";
import { currentLocale } from "@/lib/i18n/server";
import { getTranslator, type MessageKey } from "@/lib/i18n/messages";
import { faqEntries, supportCopy } from "@/lib/support/knowledge";

export default async function Landing() {
  const { locale } = await currentLocale();
  const t = getTranslator(locale);
  const m = (key: Parameters<typeof t.t<"landing">>[1]) => t.t("landing", key);
  const support = supportCopy(locale);

  const loop = [
    [m("howDiscover"), m("howDiscoverBody")],
    [m("howCorrelate"), m("howCorrelateBody")],
    [m("howClassify"), m("howClassifyBody")],
    [m("howExplain"), m("howExplainBody")],
  ];

  const comparisonRows = [
    [m("differenceRowJob"), m("differenceRowJobOutside"), m("differenceRowJobScanner")],
    [m("differenceRowChange"), m("differenceRowChangeOutside"), m("differenceRowChangeScanner")],
    [m("differenceRowEvidence"), m("differenceRowEvidenceOutside"), m("differenceRowEvidenceScanner")],
    [m("differenceRowRemediation"), m("differenceRowRemediationOutside"), m("differenceRowRemediationScanner")],
    [m("differenceRowVerification"), m("differenceRowVerificationOutside"), m("differenceRowVerificationScanner")],
    [m("differenceRowRollback"), m("differenceRowRollbackOutside"), m("differenceRowRollbackScanner")],
  ];

  return (
    <div className="relative">
      <header className="sticky top-0 z-40 border-b border-line/60 bg-base-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-y-2 px-4 py-4 sm:px-6">
          <Wordmark className="h-6" />
          <nav className="hidden items-center gap-7 text-sm text-ink-soft md:flex">
            <a href="#loop" className="hover:text-ink">{m("navHow")}</a>
            <a href="#guardian" className="hover:text-ink">{m("navGuardian")}</a>
            <a href="#difference" className="hover:text-ink">{m("navFeatures")}</a>
            <a href="#intelligence" className="hover:text-ink">{m("navIntelligence")}</a>
            <a href="#pricing" className="hover:text-ink">{m("navPricing")}</a>
            <a href="#faq" className="hover:text-ink">{support.navFaq}</a>
          </nav>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <LanguageSwitcher current={locale} label={t.t("common", "changeLanguage")} />
            <NavAuthLink />
            <Link href="/scan?target=northstar&mode=demo&present=1" className="mono whitespace-nowrap rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink hover:bg-base-700 sm:px-3">
              {m("navWatchDemo")}
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-line/60">
          <div className="grid-backdrop pointer-events-none absolute inset-0 opacity-55" />
          <div className="hero-orb pointer-events-none absolute left-[9%] top-20 h-[520px] w-[520px] rounded-full opacity-60" />
          <div className="relative mx-auto grid max-w-[1380px] gap-14 px-6 pb-16 pt-20 lg:grid-cols-[.88fr_1.12fr] lg:items-center lg:pb-20 lg:pt-24">
            <div className="min-w-0 animate-rise-in">
              <span className="mono mb-7 inline-flex items-center gap-2 rounded-full border border-signal/20 bg-signal/4 px-3 py-1.5 text-[11px] uppercase tracking-[.2em] text-signal">
                <span className="h-1.5 w-1.5 rounded-full bg-signal" />
                {m("heroBadge")}
              </span>
              <h1 className="display-type max-w-3xl text-4xl font-semibold leading-[.98] tracking-[-.045em] text-ink sm:text-5xl md:text-7xl">
                {m("heroTitle")} <span className="text-gradient">{m("heroTitleAccent")}</span>
              </h1>
              <p className="mt-7 max-w-xl text-lg leading-8 text-ink-soft">{m("heroBody")}</p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link href="/scan" className="rounded-lg bg-signal px-5 py-3 text-center text-sm font-semibold text-base-950 shadow-glow transition hover:bg-signal-bright">
                  {m("heroPrimaryCta")}
                </Link>
                <a href="#loop" className="rounded-lg border border-line px-5 py-3 text-center text-sm font-medium text-ink transition hover:border-signal/40 hover:text-signal">
                  {m("heroSecondaryCta")}
                </a>
              </div>
              <p className="mono mt-5 text-[11px] uppercase tracking-[.13em] text-ink-faint">{m("heroAssurance")}</p>
            </div>

            <ResolutionLedger m={m} />
          </div>

          <div className="relative mx-auto max-w-6xl px-6 pb-20">
            <div className="grid divide-y divide-line overflow-hidden rounded-xl border border-line bg-base-900/55 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {[
                [m("heroStatPassive"), m("heroStatPassiveLabel")],
                [m("heroStatTraceable"), m("heroStatTraceableLabel")],
                [m("heroStatContinuous"), m("heroStatContinuousLabel")],
              ].map(([value, label]) => (
                <div key={value} className="px-5 py-5 text-center">
                  <div className="text-sm font-medium text-ink">{value}</div>
                  <div className="mono mt-1 text-[10px] uppercase tracking-wider text-ink-faint">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-line/60 bg-base-900/35">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="max-w-3xl">
              <div className="mono text-[12px] uppercase tracking-widest text-signal">{m("problemKicker")}</div>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink md:text-5xl">{m("problemTitle")}</h2>
              <p className="mt-5 text-base leading-7 text-ink-soft">{m("problemBody")}</p>
            </div>
            <div className="mt-12 grid gap-8 md:grid-cols-3">
              <Concept n="01" title={m("conceptOneTitle")} body={m("conceptOneBody")} />
              <Concept n="02" title={m("conceptTwoTitle")} body={m("conceptTwoBody")} />
              <Concept n="03" title={m("conceptThreeTitle")} body={m("conceptThreeBody")} />
            </div>
          </div>
        </section>

        <section id="loop" className="scroll-mt-24 border-b border-line/60">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <SectionTitle kicker={m("howKicker")} title={m("howTitle")} />
            <div className="mt-12 grid gap-4 md:grid-cols-4">
              {loop.map(([title, body], index) => (
                <article key={title} className="panel p-5">
                  <div className="mono text-signal">{String(index + 1).padStart(2, "0")}</div>
                  <h3 className="mt-3 text-lg text-ink">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="guardian" className="relative scroll-mt-24 overflow-hidden border-b border-line/60">
          <div className="grid-backdrop pointer-events-none absolute inset-0 opacity-30" />
          <div className="relative mx-auto grid max-w-6xl gap-12 px-6 py-24 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
            <div>
              <div className="mono text-[12px] uppercase tracking-widest text-signal">{m("guardianKicker")}</div>
              <h2 className="mt-4 text-4xl font-semibold tracking-tight text-ink">{m("guardianTitle")} <span className="text-gradient">{m("guardianTitleAccent")}</span></h2>
              <p className="mt-5 max-w-xl text-base leading-7 text-ink-soft">{m("guardianBody")}</p>
              <div className="mt-7 flex flex-wrap gap-2">
                {[m("guardianChipDrift"), m("guardianChipChecklist"), m("guardianChipRemediation"), m("guardianChipDigest"), m("guardianChipWorkflow")].map((item) => (
                  <span key={item} className="mono rounded-full border border-line bg-base-900/70 px-3 py-1.5 text-[11px] text-ink-soft">{item}</span>
                ))}
              </div>
            </div>
            <div className="premium-surface p-5 md:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
                <div>
                  <div className="mono text-[10px] uppercase tracking-[.16em] text-ink-faint">{m("guardianSampleDrift")}</div>
                  <div className="mt-2 text-xl font-medium text-ink">{m("guardianSampleHeadline")} <span className="text-signal">{m("guardianSampleHeadlineAccent")}</span></div>
                </div>
                <span className="mono rounded-md border border-signal/25 bg-signal/5 px-2 py-1 text-[10px] uppercase text-signal">{m("guardianSampleWatching")}</span>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {[["+3", m("guardianSampleNewAssets")], ["2", m("guardianSampleReviewItems")], ["8/10", m("guardianSampleControls")]].map(([value, label]) => (
                  <div key={label} className="rounded-lg border border-line bg-base-950/70 p-4">
                    <div className="text-xl font-semibold text-ink">{value}</div>
                    <div className="mono mt-1 text-[10px] uppercase text-ink-faint">{label}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-lg border border-risk-medium/20 bg-risk-medium/5 p-4">
                <div className="mono text-[10px] uppercase text-risk-medium">{m("guardianSampleReview")}</div>
                <p className="mt-2 text-sm leading-6 text-ink-soft">{m("guardianSampleReviewBody")}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-line/60 bg-base-900/35">
          <div className="mx-auto grid max-w-6xl gap-12 px-6 py-24 lg:grid-cols-[.84fr_1.16fr] lg:items-center">
            <div>
              <div className="mono text-[12px] uppercase tracking-widest text-signal">{m("remediationKicker")}</div>
              <h2 className="mt-3 text-4xl font-semibold tracking-tight text-ink">{m("remediationTitle")}</h2>
              <p className="mt-5 text-base leading-7 text-ink-soft">{m("remediationBody")}</p>
              <ul className="mt-7 space-y-3 text-sm leading-6 text-ink-soft">
                {[m("remediationPoint1"), m("remediationPoint2"), m("remediationPoint3"), m("remediationPoint4")].map((point) => (
                  <li key={point} className="border-l-2 border-signal/60 pl-4">{point}</li>
                ))}
              </ul>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <ProofCard label={m("remediationGuidedLabel")} body={m("remediationGuidedBody")} />
              <ProofCard label={m("remediationConnectedLabel")} body={m("remediationConnectedBody")} />
              <ProofCard label={m("remediationVerificationLabel")} body={m("remediationVerificationBody")} />
            </div>
          </div>
        </section>

        <section className="border-b border-line/60">
          <div className="mx-auto grid max-w-6xl gap-12 px-6 py-24 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
            <div>
              <div className="mono text-[12px] uppercase tracking-widest text-signal">{m("agencyKicker")}</div>
              <h2 className="mt-3 text-4xl font-semibold tracking-tight text-ink">{m("agencyTitle")}</h2>
              <p className="mt-5 text-base leading-7 text-ink-soft">{m("agencyBody")}</p>
              <ul className="mt-7 space-y-3 text-sm text-ink-soft">
                {[m("agencyPoint1"), m("agencyPoint2"), m("agencyPoint3"), m("agencyPoint4")].map((point) => (
                  <li key={point} className="border-l-2 border-signal/60 pl-4">{point}</li>
                ))}
              </ul>
              <Link href="/agency" className="mt-8 inline-flex rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink transition hover:border-signal/40 hover:text-signal">{m("agencyCta")}</Link>
            </div>
            <div className="premium-surface overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <span className="text-sm font-medium text-ink">{m("agencyProductName")}</span>
                <span className="mono text-[10px] uppercase text-signal">{m("agencyDashboardVerification")}</span>
              </div>
              <div className="grid grid-cols-3 divide-x divide-line border-b border-line">
                {[["30", m("agencyDashboardClients")], ["17", m("agencyDashboardOpen")], ["42", m("agencyDashboardClosed")]].map(([value, label]) => (
                  <div key={label} className="p-5">
                    <div className="text-2xl font-semibold text-ink">{value}</div>
                    <div className="mono mt-1 text-[10px] uppercase text-ink-faint">{label}</div>
                  </div>
                ))}
              </div>
              <div className="space-y-2 p-5">
                {["Acme Commerce", "Northstar Labs", "Atlas Financial", "Velora Systems"].map((client, index) => (
                  <div key={client} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 rounded-lg border border-line bg-base-950/65 px-4 py-3 text-sm">
                    <span className="text-ink">{client}</span>
                    <span className="mono text-[10px] text-ink-faint">{["3", "0", "2", "1"][index]}</span>
                    <span className="mono rounded-md border border-signal/20 bg-signal/5 px-2 py-1 text-[9px] uppercase text-signal">{m("ledgerResolutionVerified")}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="difference" className="scroll-mt-24 border-b border-line/60 bg-base-900/35">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <SectionTitle kicker={m("differenceKicker")} title={m("differenceTitle")} />
            <p className="mt-5 max-w-3xl text-base leading-7 text-ink-soft">{m("differenceBody")}</p>
            <div className="mt-10 overflow-x-auto rounded-xl border border-line bg-base-950/60">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-line bg-base-900/65">
                    <th scope="col" className="px-5 py-4 font-medium text-ink-soft">{m("differenceCapability")}</th>
                    <th scope="col" className="px-5 py-4 font-medium text-signal">{m("differenceOutside")}</th>
                    <th scope="col" className="px-5 py-4 font-medium text-ink-soft">{m("differenceScanner")}</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map(([capability, outside, scanner]) => (
                    <tr key={capability} className="border-b border-line/70 last:border-0">
                      <th scope="row" className="px-5 py-4 font-medium text-ink">{capability}</th>
                      <td className="px-5 py-4 leading-6 text-ink-soft">{outside}</td>
                      <td className="px-5 py-4 leading-6 text-ink-faint">{scanner}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section id="features" className="border-b border-line/60">
          <div className="mx-auto max-w-6xl space-y-4 px-6 py-20">
            <SectionTitle kicker={m("featuresKicker")} title={m("featuresTitle")} />
            <div className="mt-8 grid gap-4 md:grid-cols-6">
              <Feature className="md:col-span-3" title={m("featureAttackerView")} body={m("featureAttackerViewBody")} />
              <Feature className="md:col-span-3" title={m("featureShadowAssets")} body={m("featureShadowAssetsBody")} />
              <Feature className="md:col-span-3" title={m("featureChange")} body={m("featureChangeBody")} />
              <Feature className="md:col-span-3" title={m("featurePosture")} body={m("featurePostureBody")} />
            </div>
          </div>
        </section>

        <section id="intelligence" className="scroll-mt-24 border-b border-line/60 bg-base-900/35">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <SectionTitle kicker={m("intelligenceKicker")} title={m("intelligenceTitle")} />
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {[
                { title: m("intelligenceCve"), body: m("intelligenceCveBody") },
                { title: m("intelligenceEnrichment"), body: m("intelligenceEnrichmentBody") },
                { title: m("intelligenceChronos"), body: m("intelligenceChronosBody") },
                { title: m("intelligenceTwin"), body: m("intelligenceTwinBody") },
                { title: m("intelligenceCapabilities"), body: m("intelligenceCapabilitiesBody") },
                { title: m("intelligenceEvolution"), body: m("intelligenceEvolutionBody") },
              ].map(({ title, body }) => (
                <Feature key={title} title={title} body={body} />
              ))}
            </div>
          </div>
        </section>

        <section id="security" className="border-b border-line/60">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <SectionTitle kicker={m("securityKicker")} title={m("securityTitle")} />
            <div className="mt-10 grid gap-4 md:grid-cols-2">
              {[
                { title: m("securityPassive"), body: m("securityPassiveBody") },
                { title: m("securitySsrf"), body: m("securitySsrfBody") },
                { title: m("securityOwnership"), body: m("securityOwnershipBody") },
                { title: m("securityRateLimit"), body: m("securityRateLimitBody") },
              ].map(({ title, body }) => (
                <Feature key={title} title={title} body={body} />
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="scroll-mt-24 border-b border-line/60 bg-base-900/35">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <SectionTitle kicker={m("pricingKicker")} title={m("pricingTitle")} />
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              <Plan name={m("planSnapshot")} price={m("planSnapshotPrice")} cadence={m("planSnapshotCadence")} popular={m("pricingPopular")} cta={{ label: m("planSnapshotCta"), href: "/login" }} features={[m("planSnapshotFeature1"), m("planSnapshotFeature2"), m("planSnapshotFeature3"), m("planSnapshotFeature4")]} />
              <Plan name={m("planProfessional")} price="$79" cadence={m("planProfessionalCadence")} popular={m("pricingPopular")} highlight cta={{ label: m("planProfessionalCta"), href: "/login?next=/billing" }} features={[m("planProfessionalFeature1"), m("planProfessionalFeature2"), m("planProfessionalFeature3"), m("planProfessionalFeature4"), m("planProfessionalFeature5"), m("planProfessionalFeature6")]} />
              <Plan name={m("planAgency")} price="$249" cadence={m("planAgencyCadence")} popular={m("pricingPopular")} cta={{ label: m("planAgencyCta"), href: "/login?next=/billing" }} features={[m("planAgencyFeature1"), m("planAgencyFeature2"), m("planAgencyFeature3"), m("planAgencyFeature4"), m("planAgencyFeature5")]} />
            </div>
            <p className="mono mt-6 text-center text-xs text-ink-faint">{m("pricingNote")}</p>
          </div>
        </section>

        <SupportExperience locale={locale} entries={faqEntries(locale)} copy={support} />

        <section className="mx-auto max-w-6xl px-6 py-24 text-center">
          <h2 className="text-4xl font-semibold tracking-tight text-ink">{m("ctaTitle")}</h2>
          <p className="mx-auto mt-4 max-w-xl text-ink-soft">{m("ctaBody")}</p>
          <div className="mt-8 flex flex-col items-center"><HeroInput /></div>
        </section>
      </main>

      <footer className="border-t border-line/60">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div>
              <Wordmark className="h-5" />
              <p className="mono mt-3 max-w-xs text-xs leading-5 text-ink-faint">{m("footerTagline")}</p>
            </div>
            <nav className="flex flex-wrap gap-x-8 gap-y-2 text-sm text-ink-soft">
              <a href="#loop" className="hover:text-ink">{m("navHow")}</a>
              <a href="#difference" className="hover:text-ink">{m("navFeatures")}</a>
              <a href="#pricing" className="hover:text-ink">{m("navPricing")}</a>
              <a href="#faq" className="hover:text-ink">{support.navFaq}</a>
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

function ResolutionLedger({ m }: { m: (key: MessageKey<"landing">) => string }) {
  return (
    <div className="animate-rise-in [animation-delay:160ms]">
      <div className="premium-surface overflow-hidden p-4 shadow-[0_40px_140px_-55px_rgba(56,225,195,.24)] sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[1fr_150px_1fr]">
          <article className="rounded-xl border border-risk-high/25 bg-risk-high/4 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="mono text-[10px] uppercase tracking-[.15em] text-risk-high">{m("ledgerBefore")}</span>
              <span className="mono rounded-md border border-risk-high/25 px-2 py-1 text-[9px] uppercase text-risk-high">{m("ledgerRiskValue")}</span>
            </div>
            <h2 className="mt-4 text-lg font-medium text-ink">{m("ledgerChangeDetected")}</h2>
            <p className="mono mt-1 text-[11px] text-ink-faint">{m("ledgerAsset")}</p>
            <LedgerItem label={m("ledgerEvidenceLabel")} body={m("ledgerEvidenceBody")} />
            <LedgerItem label={m("ledgerWhyLabel")} body={m("ledgerWhyBody")} />
          </article>

          <div className="flex flex-col justify-center rounded-xl border border-line bg-base-950/70 p-4 text-center">
            <div className="mono text-[9px] uppercase tracking-[.14em] text-signal">{m("ledgerApproved")}</div>
            <div className="my-4 border-t border-signal/40" />
            <div className="text-sm font-medium text-ink">Cloudflare</div>
            <div className="mono mt-1 text-[9px] uppercase text-ink-faint">{m("ledgerProvider")}</div>
            <div className="my-4 border-t border-signal/40" />
            <div className="mono text-[9px] uppercase tracking-[.14em] text-signal">{m("ledgerResolutionVerified")}</div>
          </div>

          <article className="rounded-xl border border-signal/25 bg-signal/4 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="mono text-[10px] uppercase tracking-[.15em] text-signal">{m("ledgerAfter")}</span>
              <span className="mono rounded-md border border-signal/25 px-2 py-1 text-[9px] uppercase text-signal">{m("ledgerPostCheckBody")}</span>
            </div>
            <h2 className="mt-4 text-lg font-medium text-ink">{m("ledgerResolutionVerified")}</h2>
            <p className="mono mt-1 text-[11px] text-ink-faint">{m("ledgerAsset")}</p>
            <LedgerItem label={m("ledgerPolicyLabel")} body={m("ledgerPolicyBody")} />
            <LedgerItem label={m("ledgerPostCheckLabel")} body={m("ledgerEvidencePreserved")} />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
              <span className="mono text-[10px] text-ink-faint">{m("ledgerElapsed")}</span>
              <span className="mono text-[10px] text-signal">{m("ledgerRollback")}</span>
            </div>
          </article>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-base-950/65 px-4 py-3">
          <span className="mono text-[9px] uppercase tracking-[.15em] text-ink-faint">{m("ledgerAuditLabel")}</span>
          <span className="text-xs text-ink-soft">{m("ledgerAuditBody")}</span>
        </div>
      </div>
    </div>
  );
}

function LedgerItem({ label, body }: { label: string; body: string }) {
  return (
    <div className="mt-4 border-t border-line/70 pt-3">
      <div className="mono text-[9px] uppercase tracking-[.14em] text-ink-faint">{label}</div>
      <p className="mt-1 text-xs leading-5 text-ink-soft">{body}</p>
    </div>
  );
}

function SectionTitle({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div>
      <div className="mono text-[12px] uppercase tracking-widest text-signal">{kicker}</div>
      <h2 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-ink md:text-4xl">{title}</h2>
    </div>
  );
}

function Concept({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <article>
      <div className="mono text-sm text-signal">{n}</div>
      <h3 className="mt-3 text-xl text-ink">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">{body}</p>
    </article>
  );
}

function ProofCard({ label, body }: { label: string; body: string }) {
  return (
    <article className="panel p-5">
      <div className="mono text-[10px] uppercase tracking-[.14em] text-signal">{label}</div>
      <p className="mt-4 text-sm leading-6 text-ink-soft">{body}</p>
    </article>
  );
}

function Feature({ title, body, className = "" }: { title: string; body: string; className?: string }) {
  return (
    <article className={`panel p-6 ${className}`}>
      <h3 className="text-lg text-ink">{title}</h3>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-soft">{body}</p>
    </article>
  );
}

function Plan({ name, price, cadence, features, cta, popular, highlight = false }: { name: string; price: string; cadence: string; features: string[]; cta: { label: string; href: string }; popular: string; highlight?: boolean }) {
  return (
    <article className={`panel flex flex-col p-6 ${highlight ? "ring-1 ring-signal/40" : ""}`}>
      <div className="flex items-center justify-between">
        <span className="text-ink">{name}</span>
        {highlight && <span className="mono rounded-md border border-signal/30 px-2 py-0.5 text-[11px] uppercase tracking-wider text-signal">{popular}</span>}
      </div>
      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-3xl font-semibold text-ink">{price}</span>
        <span className="mono text-xs text-ink-faint">{cadence}</span>
      </div>
      <ul className="mt-5 flex-1 space-y-2 text-sm text-ink-soft">
        {features.map((feature) => <li key={feature} className="border-l border-signal/50 pl-3">{feature}</li>)}
      </ul>
      <Link href={cta.href} className={`mt-6 rounded-lg px-4 py-2.5 text-center text-sm font-semibold ${highlight ? "bg-signal text-base-950 hover:bg-signal-bright" : "border border-line text-ink hover:border-signal/40"}`}>
        {cta.label}
      </Link>
    </article>
  );
}
