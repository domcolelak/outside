import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext, roleAtLeast } from "@/lib/auth";
import { GuardianDashboard } from "@/components/guardian/GuardianDashboard";
import { PresentationControls } from "@/components/experience/PresentationControls";
import { getGuardianStore } from "@/lib/guardian/store";
import { currentLocale } from "@/lib/i18n/server";
import { getTranslator, type MessageKey } from "@/lib/i18n/messages";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await currentLocale();
  const tr = getTranslator(locale);
  return {
    title: tr.t("guardian", "metaTitle"),
    description: tr.t("guardian", "metaDescription"),
  };
}

export default async function GuardianPage({ searchParams }: { searchParams: Promise<{ orgId?: string }> }) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  const requested = (await searchParams).orgId;
  const membership = ctx.memberships.find((item) => item.org.id === requested) ?? ctx.memberships[0];
  if (!membership) redirect("/account");
  const premium = membership.org.plan !== "free";
  const { locale } = await currentLocale();
  const t = getTranslator(locale);
  const g = (key: MessageKey<"guardian">) => t.t("guardian", key);
  return (
    <>
      <div data-capture-hide className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="mono text-[10px] uppercase tracking-[.18em] text-signal">{g("workspaceKicker")}</div>
          <div className="mt-0.5 text-sm text-ink-soft">{membership.org.name}</div>
        </div>
        {premium && <PresentationControls name={`outside-guardian-${membership.org.slug}`} />}
      </div>
      {premium
        ? <GuardianDashboard initial={await (await getGuardianStore()).overview(membership.org.id)} orgId={membership.org.id} canAdmin={roleAtLeast(membership.role, "admin")} />
        : <GuardianPaywall g={g} />}
    </>
  );
}

function GuardianPaywall({ g }: { g: (key: MessageKey<"guardian">) => string }) {
  // The three claims are keyed individually rather than held as one array, so a
  // translator sees each value with the label it belongs to.
  const stats = [
    [g("paywallStat1Value"), g("paywallStat1Label"), g("paywallStat1Detail")],
    [g("paywallStat2Value"), g("paywallStat2Label"), g("paywallStat2Detail")],
    [g("paywallStat3Value"), g("paywallStat3Label"), g("paywallStat3Detail")],
  ];
  return <section className="premium-surface relative min-h-[680px] overflow-hidden p-8 md:p-16"><div className="absolute inset-0 grid-backdrop opacity-60"/><div className="hero-orb absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full"/><div className="relative mx-auto max-w-4xl text-center"><div className="mono inline-flex items-center gap-2 rounded-full border border-signal/20 bg-signal/5 px-3 py-1.5 text-[11px] uppercase tracking-[.18em] text-signal"><span className="relative flex h-1.5 w-1.5"><span className="absolute h-full w-full animate-ping rounded-full bg-signal opacity-30"/><span className="relative h-1.5 w-1.5 rounded-full bg-signal"/></span>{g("paywallBadge")}</div><h1 className="display-type mt-8 text-4xl font-semibold tracking-[-.04em] text-gradient md:text-7xl">{g("paywallTitleLine1")}<br/>{g("paywallTitleLine2")}</h1><p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-ink-soft">{g("paywallBody")}</p><div className="mt-12 grid gap-3 text-left sm:grid-cols-3">{stats.map(([value,label,detail]) => <div key={label} className="motion-card rounded-2xl border border-line bg-base-950/60 p-5"><div className="text-3xl font-semibold text-signal">{value}</div><div className="mt-3 text-sm font-medium text-ink">{label}</div><div className="mt-2 text-xs leading-5 text-ink-faint">{detail}</div></div>)}</div><div className="mt-10 flex flex-wrap justify-center gap-3"><Link href="/billing" className="rounded-xl bg-signal px-6 py-3 text-sm font-semibold text-base-950 shadow-glow">{g("paywallUnlock")}</Link><Link href="/scan?target=northstar&mode=demo&present=1" className="rounded-xl border border-line px-6 py-3 text-sm text-ink-soft">{g("paywallDemo")}</Link></div></div></section>;
}
