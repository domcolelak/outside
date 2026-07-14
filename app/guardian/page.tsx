import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext, roleAtLeast } from "@/lib/auth";
import { Wordmark } from "@/components/Wordmark";
import { LogoutButton } from "@/components/account/AccountControls";
import { GuardianDashboard } from "@/components/guardian/GuardianDashboard";
import { getGuardianStore } from "@/lib/guardian/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Guardian · OUTSIDE", description: "Continuous external presence intelligence for OUTSIDE." };

export default async function GuardianPage({ searchParams }: { searchParams: Promise<{ orgId?: string }> }) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  const requested = (await searchParams).orgId;
  const membership = ctx.memberships.find((item) => item.org.id === requested) ?? ctx.memberships[0];
  if (!membership) redirect("/account");

  return <div className="min-h-screen"><header className="sticky top-0 z-30 border-b border-line bg-base-950/80 backdrop-blur-xl"><div className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-4 md:px-8"><Link href="/"><Wordmark className="h-6"/></Link><nav className="flex items-center gap-4"><Link href="/account" className="mono text-[10px] uppercase tracking-wider text-ink-faint hover:text-ink">Workspace</Link><Link href="/scan" className="mono text-[10px] uppercase tracking-wider text-ink-faint hover:text-ink">Scan</Link><LogoutButton/></nav></div></header><main className="mx-auto max-w-[1500px] px-5 py-7 md:px-8 md:py-10">{membership.org.plan === "free" ? <section className="panel relative min-h-[620px] overflow-hidden p-8 md:p-16"><div className="absolute inset-0 grid-backdrop opacity-50"/><div className="relative mx-auto max-w-3xl text-center"><div className="mono inline-flex items-center gap-2 rounded-full border border-signal/20 bg-signal/5 px-3 py-1.5 text-[10px] uppercase tracking-[.18em] text-signal"><span className="h-1.5 w-1.5 rounded-full bg-signal"/>Premium intelligence</div><h1 className="mt-8 text-4xl font-semibold tracking-tight text-gradient md:text-6xl">Your external security analyst.<br/>Always watching.</h1><p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-ink-soft">Guardian turns verified OUTSIDE observations into continuous change intelligence, Exposure Drift, a living control checklist, evidence-backed recommendations, premium remediation guides, and executive reporting.</p><div className="mt-10 grid gap-3 text-left sm:grid-cols-3">{[["24/7", "Correlated monitoring"], ["10", "Living controls"], ["0", "Fabricated findings"]].map(([value, label]) => <div key={label} className="rounded-xl border border-line bg-base-900/70 p-5"><div className="text-3xl font-semibold text-signal">{value}</div><div className="mono mt-2 text-[10px] uppercase text-ink-faint">{label}</div></div>)}</div><div className="mt-10 flex flex-wrap justify-center gap-3"><Link href="/billing" className="rounded-lg bg-signal px-6 py-3 text-sm font-semibold text-base-950">Unlock Guardian</Link><Link href="/account" className="rounded-lg border border-line px-6 py-3 text-sm text-ink-soft">Back to workspace</Link></div></div></section> : <GuardianDashboard initial={await (await getGuardianStore()).overview(membership.org.id)} orgId={membership.org.id} canAdmin={roleAtLeast(membership.role, "admin")}/>}</main></div>;
}
