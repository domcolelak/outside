import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { getAgencyStore } from "@/lib/agency/store";
import { ClientWorkspace } from "@/components/agency/ClientWorkspace";
import { Wordmark } from "@/components/Wordmark";
import { currentLocale } from "@/lib/i18n/server";
import { getTranslator, type MessageKey } from "@/lib/i18n/messages";

export const dynamic = "force-dynamic";
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ agencyId?: string }> }) {
  const { locale } = await currentLocale();
  const tr = getTranslator(locale);
  const g = (key: MessageKey<"agency">, values?: Record<string, string | number>) => tr.t("agency", key, values);
  const ctx = await getSessionContext(); if (!ctx) redirect("/login"); const store = await getAgencyStore(); const requestedAgencyId = (await searchParams).agencyId; const resolved = requestedAgencyId ? await Promise.all([store.workspace(requestedAgencyId), store.membershipForUser(requestedAgencyId, ctx.user.id)]).then(([workspace, membership]) => workspace && membership ? { workspace, membership } : null) : await store.workspaceForUser(ctx.user.id); if (!resolved) redirect("/agency");
  const clientId = (await params).id; const client = (await store.clients(resolved.workspace.id)).find((item) => item.id === clientId); if (!client) redirect("/agency");
  return <div className="min-h-screen"><header className="border-b border-line"><div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4"><Link href="/"><Wordmark className="h-6" /></Link><Link href="/agency" className="mono text-[11px] uppercase text-signal">{g("portfolio")}</Link></div></header><main className="mx-auto max-w-7xl px-6 py-8"><ClientWorkspace agencyId={resolved.workspace.id} clientId={client.id} /></main></div>;
}
