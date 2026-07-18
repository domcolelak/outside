import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { getAgencyStore } from "@/lib/agency/store";
import { hasAgencyPermission } from "@/lib/agency/types";
import { AgencyAdmin } from "@/components/agency/AgencyAdmin";
import { AgencyAnalytics } from "@/components/agency/AgencyAnalytics";
import { Wordmark } from "@/components/Wordmark";

export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ agencyId?: string }> }) {
  const ctx = await getSessionContext(); if (!ctx) redirect("/login?next=/agency/manage");
  const store = await getAgencyStore(); const requested = (await searchParams).agencyId; const resolved = requested ? await Promise.all([store.workspace(requested), store.membershipForUser(requested, ctx.user.id)]).then(([workspace, membership]) => workspace && membership ? { workspace, membership } : null) : await store.workspaceForUser(ctx.user.id); if (!resolved || (!hasAgencyPermission(resolved.membership.role, "agency:manage") && !hasAgencyPermission(resolved.membership.role, "billing:manage"))) redirect("/agency");
  const agencyManager = hasAgencyPermission(resolved.membership.role, "agency:manage"); return <div className="min-h-screen"><header className="border-b border-line"><div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4"><Link href="/"><Wordmark className="h-6" /></Link><Link href={`/agency?agencyId=${resolved.workspace.id}`} className="mono text-[10px] uppercase text-signal">Back to portfolio</Link></div></header><main className="mx-auto max-w-7xl px-6 py-8">{agencyManager ? <AgencyAdmin agencyId={resolved.workspace.id} role={resolved.membership.role} /> : <div className="space-y-6"><div><div className="mono text-[10px] uppercase text-signal">Billing operations</div><h1 className="mt-2 text-3xl font-semibold">{resolved.workspace.name}</h1></div><AgencyAnalytics agencyId={resolved.workspace.id} canManageBilling /></div>}</main></div>;
}
