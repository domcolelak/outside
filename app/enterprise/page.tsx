import Link from "next/link";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/Wordmark";
import { LogoutButton } from "@/components/account/AccountControls";
import { EnterpriseConsole } from "@/components/enterprise/EnterpriseConsole";
import { enterpriseAccess } from "@/lib/enterprise/access";
import { getEnterpriseStore } from "@/lib/enterprise/store";
import { currentTranslator } from "@/lib/i18n/server";

export default async function EnterprisePage({ searchParams }: { searchParams: Promise<{ orgId?: string }> }) {
  const tr = await currentTranslator();
  const orgId = (await searchParams).orgId ?? null;
  const access = await enterpriseAccess(null, "enterprise:read", orgId);
  if (!access) redirect("/account");
  const overview = await (await getEnterpriseStore()).overview(access.workspace.id);
  if (!overview) redirect("/account");
  const organizationName = access.session?.memberships.find((item) => item.org.id === access.workspace.orgId)?.org.name ?? tr.t("enterprise", "workspaceFallback");
  return <div className="min-h-screen">
    <header className="sticky top-0 z-30 border-b border-line bg-base-950/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-4 md:px-8">
        <div className="flex items-center gap-4"><Link href="/"><Wordmark className="h-6"/></Link><span className="mono rounded-sm border border-signal/20 bg-signal/5 px-2 py-1 text-[11px] uppercase tracking-wider text-signal">{tr.t("enterprise", "navEnterprise")}</span></div>
        <nav className="flex items-center gap-4" aria-label={tr.t("ui", "primaryNavigation")}>
          <Link href="/guardian" className="mono text-[11px] uppercase text-ink-faint hover:text-ink">{tr.t("enterprise", "navGuardian")}</Link>
          <Link href="/agency" className="mono text-[11px] uppercase text-ink-faint hover:text-ink">{tr.t("enterprise", "navAgency")}</Link>
          <Link href="/account" className="mono text-[11px] uppercase text-ink-faint hover:text-ink">{tr.t("enterprise", "navAccount")}</Link>
          <LogoutButton/>
        </nav>
      </div>
    </header>
    <main className="mx-auto max-w-[1500px] px-5 py-7 md:px-8 md:py-10"><EnterpriseConsole initial={overview} organizationName={organizationName}/></main>
  </div>;
}
