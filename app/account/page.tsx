import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { LogoutButton } from "@/components/account/AccountControls";
import { MonitorsPanel } from "@/components/account/MonitorsPanel";
import { TeamPanel } from "@/components/account/TeamPanel";
import { VerifyEmailBanner } from "@/components/account/VerifyEmailBanner";
import { getEnterpriseStore } from "@/lib/enterprise/store";
import { currentLocale } from "@/lib/i18n/server";
import { getTranslator, type MessageKey } from "@/lib/i18n/messages";

export const dynamic = "force-dynamic";

/** Plan names read from the catalog; Professional and Agency are product names. */
const PLAN_KEYS: Record<string, MessageKey<"account">> = { free: "planFree", professional: "planProfessional", agency: "planAgency" };
const ROLE_KEYS: Record<string, MessageKey<"account">> = { owner: "roleOwner", admin: "roleAdmin", analyst: "roleAnalyst", viewer: "roleViewer" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ emailVerification?: string }> }) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  const notice = (await searchParams).emailVerification;
  const { locale } = await currentLocale();
  const t = getTranslator(locale);
  const a = (key: MessageKey<"account">, values?: Record<string, string | number>) => t.t("account", key, values);

  const primary = ctx.memberships[0];
  const enterpriseOrganizations = (await Promise.all(ctx.memberships.map(async (membership) => ({ membership, workspace: await (await getEnterpriseStore()).workspaceByOrg(membership.org.id) })))).filter((item) => item.workspace);

  return (
    <>
        <VerifyEmailBanner verified={!!ctx.user.emailVerifiedAt} email={ctx.user.email} notice={notice === "complete" || notice === "invalid" ? notice : undefined} />

        <div>
          <div className="mono text-[12px] uppercase tracking-widest text-signal">{a("workspaceKicker")}</div>
          <h1 className="mt-2 text-3xl font-semibold text-ink">{a("welcome", { firstName: ctx.user.name.split(" ")[0] ?? ctx.user.name })}</h1>
          <p className="mt-1 text-sm text-ink-soft">{ctx.user.email}</p>
        </div>

        <section>
          <div className="mono mb-3 text-[12px] uppercase tracking-wider text-ink-faint">{a("organizations")}</div>
          <div className="grid gap-3 md:grid-cols-2">
            {ctx.memberships.map((m) => (
              <div key={m.org.id} className="panel flex items-center justify-between p-4">
                <div>
                  <div className="text-ink">{m.org.name}</div>
                  <div className="mono mt-1 text-[12px] text-ink-faint">{PLAN_KEYS[m.org.plan] ? a(PLAN_KEYS[m.org.plan]!) : m.org.plan} · {ROLE_KEYS[m.role] ? a(ROLE_KEYS[m.role]!) : m.role}</div>
                </div>
                <Link href="/billing" className="mono rounded-md border border-line px-2.5 py-1 text-[12px] text-ink-soft hover:bg-base-700">{a("billing")}</Link>
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
