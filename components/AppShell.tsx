import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { isFounder } from "@/lib/auth/founder";
import { getEnterpriseStore } from "@/lib/enterprise/store";
import { Wordmark } from "@/components/Wordmark";
import { LogoutButton } from "@/components/account/AccountControls";

export type AppSection =
  | "overview"
  | "guardian"
  | "assess"
  | "history"
  | "integrations"
  | "capabilities"
  | "billing"
  | "agency"
  | "enterprise"
  | "evolution";

/**
 * The one navigation shell for signed-in pages.
 *
 * Every page used to hand-roll its own header, so the only way to move between
 * features was to go "Back to account" first. This centralises it: one nav,
 * every page, active section highlighted.
 *
 * Links appear only when the account can actually use them — an Agency, Enterprise
 * or Evolution link that answers 403 is worse than no link at all.
 */
export async function AppShell({
  active,
  actions,
  children,
  width = "max-w-5xl",
}: {
  active: AppSection;
  actions?: React.ReactNode;
  children: React.ReactNode;
  width?: string;
}) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");

  const enterpriseOrg = (
    await Promise.all(
      ctx.memberships.map(async (membership) => ({
        membership,
        workspace: await (await getEnterpriseStore()).workspaceByOrg(membership.org.id),
      })),
    )
  ).find((item) => item.workspace)?.membership.org;

  const items: Array<{ key: AppSection; href: string; label: string; accent?: boolean }> = [
    { key: "overview", href: "/account", label: "Overview" },
    { key: "guardian", href: "/guardian", label: "Guardian", accent: true },
    { key: "assess", href: "/assess", label: "Assess" },
    { key: "history", href: "/chronos", label: "History" },
    { key: "integrations", href: "/integrations", label: "Integrations" },
    { key: "capabilities", href: "/capabilities", label: "Capabilities" },
    { key: "billing", href: "/billing", label: "Billing" },
  ];
  if (ctx.memberships.some((membership) => membership.org.plan === "agency")) {
    items.splice(1, 0, { key: "agency", href: "/agency", label: "Agency", accent: true });
  }
  if (enterpriseOrg) {
    items.splice(1, 0, { key: "enterprise", href: `/enterprise?orgId=${enterpriseOrg.id}`, label: "Enterprise", accent: true });
  }
  if (isFounder(ctx)) {
    items.push({ key: "evolution", href: "/evolution", label: "Evolution" });
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line bg-base-950/85 backdrop-blur-md">
        <div className={`mx-auto flex ${width} flex-col items-start gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6`}>
          <Link href="/account" aria-label="OUTSIDE — go to overview"><Wordmark className="h-6" /></Link>
          <nav aria-label="Primary" className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1">
            {items.map((item) => {
              const current = item.key === active;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  aria-current={current ? "page" : undefined}
                  className={`mono rounded-md px-2 py-2 text-xs transition sm:px-2.5 ${
                    current
                      ? "bg-base-700 text-ink"
                      : item.accent
                        ? "text-signal hover:bg-base-700 hover:text-signal-bright"
                        : "text-ink-soft hover:bg-base-700 hover:text-ink"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            <Link href="/scan" className="mono rounded-md px-2 py-2 text-xs text-ink-soft transition hover:bg-base-700 hover:text-ink sm:px-2.5">
              New scan
            </Link>
            {actions}
            <LogoutButton />
          </nav>
        </div>
      </header>
      <main className={`mx-auto ${width} px-4 py-8 sm:px-6`}>{children}</main>
    </div>
  );
}
