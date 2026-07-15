import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext, roleAtLeast } from "@/lib/auth";
import { Wordmark } from "@/components/Wordmark";
import { LogoutButton } from "@/components/account/AccountControls";
import { GuardianDashboard } from "@/components/guardian/GuardianDashboard";
import { PresentationControls } from "@/components/experience/PresentationControls";
import { getGuardianStore } from "@/lib/guardian/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Guardian · OUTSIDE", description: "Continuous external presence intelligence for OUTSIDE." };

export default async function GuardianPage({ searchParams }: { searchParams: Promise<{ orgId?: string }> }) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  const requested = (await searchParams).orgId;
  const membership = ctx.memberships.find((item) => item.org.id === requested) ?? ctx.memberships[0];
  if (!membership) redirect("/account");
  const premium = membership.org.plan !== "free";
  return <div className="min-h-screen"><header data-capture-hide className="sticky top-0 z-40 border-b border-line bg-base-950/78 backdrop-blur-2xl"><div className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-3 md:px-8"><div className="flex items-center gap-5"><Link href="/"><Wordmark className="h-6"/></Link><div className="hidden h-5 w-px bg-line md:block"/><div className="hidden md:block"><div className="mono text-[8px] uppercase tracking-[.18em] text-signal">Guardian workspace</div><div className="mt-0.5 text-xs text-ink-soft">{membership.org.name}</div></div></div><nav className="flex items-center gap-2"><Link href="/account" className="mono hidden rounded-lg px-3 py-2 text-[9px] uppercase tracking-wider text-ink-faint hover:bg-base-800 hover:text-ink md:block">Workspace</Link><Link href="/scan" className="mono hidden rounded-lg px-3 py-2 text-[9px] uppercase tracking-wider text-ink-faint hover:bg-base-800 hover:text-ink md:block">New scan</Link>{premium && <PresentationControls name={`outside-guardian-${membership.org.slug}`}/>}<LogoutButton/></nav></div></header><main className="mx-auto max-w-[1500px] px-5 py-7 md:px-8 md:py-10">{premium ? <GuardianDashboard initial={await (await getGuardianStore()).overview(membership.org.id)} orgId={membership.org.id} canAdmin={roleAtLeast(membership.role, "admin")}/> : <GuardianPaywall/>}</main></div>;
}

function GuardianPaywall() {
  return <section className="premium-surface relative min-h-[680px] overflow-hidden p-8 md:p-16"><div className="absolute inset-0 grid-backdrop opacity-60"/><div className="hero-orb absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full"/><div className="relative mx-auto max-w-4xl text-center"><div className="mono inline-flex items-center gap-2 rounded-full border border-signal/20 bg-signal/5 px-3 py-1.5 text-[10px] uppercase tracking-[.18em] text-signal"><span className="relative flex h-1.5 w-1.5"><span className="absolute h-full w-full animate-ping rounded-full bg-signal opacity-30"/><span className="relative h-1.5 w-1.5 rounded-full bg-signal"/></span>Premium continuous intelligence</div><h1 className="display-type mt-8 text-4xl font-semibold tracking-[-.04em] text-gradient md:text-7xl">A senior security analyst.<br/>Always watching.</h1><p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-ink-soft">Guardian turns verified observations into change intelligence, Exposure Drift, living controls, traceable recommendations and board-ready reporting.</p><div className="mt-12 grid gap-3 text-left sm:grid-cols-3">{[["24/7", "Correlated monitoring", "Meaningful external changes, automatically grouped."], ["10", "Living controls", "Evidence-backed posture that evolves with every scan."], ["0", "Fabricated findings", "Every conclusion remains traceable to an observation."]].map(([value,label,detail]) => <div key={label} className="motion-card rounded-2xl border border-line bg-base-950/60 p-5"><div className="text-3xl font-semibold text-signal">{value}</div><div className="mt-3 text-sm font-medium text-ink">{label}</div><div className="mt-2 text-xs leading-5 text-ink-faint">{detail}</div></div>)}</div><div className="mt-10 flex flex-wrap justify-center gap-3"><Link href="/billing" className="rounded-xl bg-signal px-6 py-3 text-sm font-semibold text-base-950 shadow-glow">Unlock Guardian</Link><Link href="/scan?target=northstar&mode=demo&present=1" className="rounded-xl border border-line px-6 py-3 text-sm text-ink-soft">Watch the 20-second demo</Link></div></div></section>;
}
