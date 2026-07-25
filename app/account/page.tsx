import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
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
    <>
        <VerifyEmailBanner verified={!!ctx.user.emailVerifiedAt} email={ctx.user.email} notice={notice === "complete" || notice === "invalid" ? notice : undefined} />

        <div>
          <div className="mono text-[12px] uppercase tracking-widest text-signal">Workspace</div>
          <h1 className="mt-2 text-3xl font-semibold text-ink">Welcome, {ctx.user.name.split(" ")[0]}</h1>
          <p className="mt-1 text-sm text-ink-soft">{ctx.user.email}</p>
        </div>

        <section>
          <div className="mono mb-3 text-[12px] uppercase tracking-wider text-ink-faint">Organizations</div>
          <div className="grid gap-3 md:grid-cols-2">
            {ctx.memberships.map((m) => (
              <div key={m.org.id} className="panel flex items-center justify-between p-4">
                <div>
                  <div className="text-ink">{m.org.name}</div>
                  <div className="mono mt-1 text-[12px] text-ink-faint">{PLAN_LABEL[m.org.plan] ?? m.org.plan} · {m.role}</div>
                </div>
                <Link href="/billing" className="mono rounded-md border border-line px-2.5 py-1 text-[12px] text-ink-soft hover:bg-base-700">Billing</Link>
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
      </>
  );
}
