import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthStore, getSessionContext } from "@/lib/auth";
import { getAgencyStore } from "@/lib/agency/store";
import { hasAgencyPermission } from "@/lib/agency/types";
import { portfolioOverview } from "@/lib/agency/service";
import { AgencyDashboard } from "@/components/agency/AgencyDashboard";
import { AgencyOnboarding } from "@/components/agency/AgencyOnboarding";
import { Wordmark } from "@/components/Wordmark";
import { LogoutButton } from "@/components/account/AccountControls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agency Suite · OUTSIDE", description: "Portfolio security operations for MSPs, MSSPs and consultants." };

export default async function AgencyPage({ searchParams }: { searchParams: Promise<{ agencyId?: string }> }) {
  const ctx = await getSessionContext(); if (!ctx) redirect("/login?next=/agency"); const store = await getAgencyStore(); const requestedAgencyId = (await searchParams).agencyId; const available = await store.workspacesForUser(ctx.user.id); const resolved = requestedAgencyId ? available.find((item) => item.workspace.id === requestedAgencyId) ?? null : available[0] ?? null; const ownerOrg = resolved ? await (await getAuthStore()).getOrganization(resolved.workspace.ownerOrgId) : null; if (resolved && ownerOrg?.plan !== "agency") redirect("/billing");
  const showManage = resolved && (hasAgencyPermission(resolved.membership.role, "agency:manage") || hasAgencyPermission(resolved.membership.role, "billing:manage"));
  return <div className="min-h-screen"><header className="sticky top-0 z-30 border-b border-line bg-base-950/85 backdrop-blur-xl"><div className="mx-auto flex max-w-[1600px] items-center justify-between px-5 py-4 md:px-8"><div className="flex items-center gap-4"><Link href="/"><Wordmark className="h-6" /></Link>{available.length > 1 && <div className="flex gap-1">{available.map((item) => <Link key={item.workspace.id} href={`/agency?agencyId=${item.workspace.id}`} className={`rounded px-2 py-1 text-[10px] ${resolved?.workspace.id === item.workspace.id ? "bg-signal/10 text-signal" : "text-ink-faint"}`}>{item.workspace.name}</Link>)}</div>}</div><nav className="flex items-center gap-4">{showManage && <Link href={`/agency/manage?agencyId=${resolved.workspace.id}`} className="mono text-[10px] uppercase text-signal hover:text-signal-bright">Manage</Link>}<Link href="/guardian" className="mono text-[10px] uppercase text-ink-faint hover:text-ink">Guardian</Link><Link href="/account" className="mono text-[10px] uppercase text-ink-faint hover:text-ink">Account</Link><LogoutButton /></nav></div></header><main className="mx-auto max-w-[1600px] px-5 py-7 md:px-8 md:py-10">{resolved ? <AgencyDashboard initial={await portfolioOverview(resolved.workspace.id, resolved.membership.role)} /> : <AgencyOnboarding organizations={ctx.memberships.filter((membership) => membership.role === "owner" && membership.org.plan === "agency").map((membership) => ({ id: membership.org.id, name: membership.org.name }))} />}</main></div>;
}
