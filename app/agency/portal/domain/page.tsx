import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { getAgencyStore } from "@/lib/agency/store";
import type { AgencyClient } from "@/lib/agency/types";

export const dynamic = "force-dynamic";
export default async function CustomAgencyDomain({ searchParams }: { searchParams: Promise<{ domain?: string }> }) {
  const domain = (await searchParams).domain?.toLowerCase().replace(/:\d+$/, "") ?? ""; const store = await getAgencyStore(); const workspace = await store.workspaceByCustomDomain(domain);
  if (!workspace?.branding.whiteLabel) return <main className="mx-auto max-w-xl px-6 py-24"><div className="panel p-8"><h1 className="text-2xl font-semibold">Portal unavailable</h1><p className="mt-3 text-sm text-ink-soft">This domain is not connected to an active client portal.</p></div></main>;
  const session = await getSessionContext(); if (!session) redirect(`/login?next=${encodeURIComponent("/")}`); const membership = await store.membershipForUser(workspace.id, session.user.id); if (membership) redirect(`/agency?agencyId=${encodeURIComponent(workspace.id)}`);
  const accessible: AgencyClient[] = []; for (const client of await store.clients(workspace.id)) if (client.portalMode !== "disabled" && await store.hasPortalInvite(workspace.id, client.id, session.user.id)) accessible.push(client);
  const onlyClient = accessible[0]; if (accessible.length === 1 && onlyClient) redirect(`/agency/portal?agencyId=${encodeURIComponent(workspace.id)}&clientId=${encodeURIComponent(onlyClient.id)}`);
  return <main className="mx-auto min-h-screen max-w-3xl px-6 py-20"><section className="panel p-8" style={{ borderTopColor: workspace.branding.primaryColor, borderTopWidth: 3 }}>{workspace.branding.logoUrl && <img src={workspace.branding.logoUrl} alt={`${workspace.name} logo`} className="mb-6 h-10 max-w-48 object-contain"/>}<h1 className="text-3xl font-semibold">{workspace.name} client portal</h1><p className="mt-2 text-sm text-ink-soft">Choose an authorized client workspace.</p><div className="mt-6 grid gap-3">{accessible.map((client) => <Link key={client.id} href={`/agency/portal?agencyId=${workspace.id}&clientId=${client.id}`} className="rounded-lg border border-line p-4 hover:border-signal/30">{client.organizationName}</Link>)}{!accessible.length && <p className="text-sm text-ink-faint">Your account has no active portal invitation for this workspace.</p>}</div></section></main>;
}
