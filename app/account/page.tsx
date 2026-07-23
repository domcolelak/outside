import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { Wordmark } from "@/components/Wordmark";
import { LogoutButton } from "@/components/account/AccountControls";
import { MonitorsPanel } from "@/components/account/MonitorsPanel";
import { TeamPanel } from "@/components/account/TeamPanel";
import { VerifyEmailBanner } from "@/components/account/VerifyEmailBanner";
import { getEnterpriseStore } from "@/lib/enterprise/store";

export const dynamic = "force-dynamic";

const PLAN_LABEL: Record<string, string> = { free: "Snapshot (Free)", professional: "Professional", agency: "Agency" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ emailVerification?: string }> }) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  const notice = (await searchParams).emailVerification;

  const primary = ctx.memberships[0];
  const enterpriseOrganizations = (await Promise.all(ctx.memberships.map(async (membership) => ({ membership, workspace: await (await getEnterpriseStore()).workspaceByOrg(membership.org.id) })))).filter((item) => item.workspace);

  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/"><Wordmark className="h-6" /></Link>
          <div className="flex items-center gap-3">
            {ctx.memberships.some((m) => m.org.plan === "agency") && <Link href="/agency" className="mono text-xs text-signal hover:text-signal-bright">Agency Suite</Link>}
            {enterpriseOrganizations.length > 0 && <Link href={`/enterprise?orgId=${enterpriseOrganizations[0]!.membership.org.id}`} className="mono text-xs text-signal hover:text-signal-bright">Enterprise</Link>}
            <Link href="/guardian" className="mono text-xs text-signal hover:text-signal-bright">Guardian</Link>
            <Link href="/chronos" className="mono text-xs text-ink-soft hover:text-ink">Chronos</Link>
            <Link href="/integrations" className="mono text-xs text-ink-soft hover:text-ink">Integrations</Link>
            <Link href="/scan?target=northstar&mode=demo" className="mono text-xs text-ink-soft hover:text-ink">Run a scan</Link>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-6 py-10">
        <VerifyEmailBanner verified={!!ctx.user.emailVerifiedAt} email={ctx.user.email} notice={notice === "complete" || notice === "invalid" ? notice : undefined} />

        <div>
          <div className="mono text-[11px] uppercase tracking-widest text-signal">Workspace</div>
          <h1 className="mt-2 text-3xl font-semibold text-ink">Welcome, {ctx.user.name.split(" ")[0]}</h1>
          <p className="mt-1 text-sm text-ink-soft">{ctx.user.email}</p>
        </div>

        <section>
          <div className="mono mb-3 text-[11px] uppercase tracking-wider text-ink-faint">Organizations</div>
          <div className="grid gap-3 md:grid-cols-2">
            {ctx.memberships.map((m) => (
              <div key={m.org.id} className="panel flex items-center justify-between p-4">
                <div>
                  <div className="text-ink">{m.org.name}</div>
                  <div className="mono mt-1 text-[11px] text-ink-faint">{PLAN_LABEL[m.org.plan] ?? m.org.plan} · {m.role}</div>
                </div>
                <Link href="/billing" className="mono rounded-md border border-line px-2.5 py-1 text-[11px] text-ink-soft hover:bg-base-700">Billing</Link>
              </div>
            ))}
          </div>
        </section>

        {primary && <MonitorsPanel orgId={primary.org.id} plan={primary.org.plan} />}
        {primary && (
          <TeamPanel
            orgId={primary.org.id}
            canInvite={primary.role === "owner" || primary.role === "admin"}
            canGrantAdmin={primary.role === "owner"}
            initialNotify={primary.notifyChanges}
          />
        )}
      </main>
    </div>
  );
}
