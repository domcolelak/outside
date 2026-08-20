import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { isFounder } from "@/lib/auth/founder";
import { getEnterpriseStore } from "@/lib/enterprise/store";
import { Wordmark } from "@/components/Wordmark";
import { LogoutButton } from "@/components/account/AccountControls";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { currentLocale } from "@/lib/i18n/server";
import { getTranslator } from "@/lib/i18n/messages";

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

  // Navigation is translated from reviewed message files, never generated.
  const { locale } = await currentLocale();
  const t = getTranslator(locale);

  const items: Array<{ key: AppSection; href: string; label: string; accent?: boolean }> = [
    { key: "overview", href: "/account", label: t.t("navigation", "overview") },
    { key: "guardian", href: "/guardian", label: t.t("navigation", "guardian"), accent: true },
    { key: "assess", href: "/assess", label: t.t("navigation", "assess") },
    { key: "history", href: "/chronos", label: t.t("navigation", "history") },
    { key: "integrations", href: "/integrations", label: t.t("navigation", "integrations") },
    { key: "capabilities", href: "/capabilities", label: t.t("navigation", "capabilities") },
    { key: "billing", href: "/billing", label: t.t("navigation", "billing") },
  ];
  if (ctx.memberships.some((membership) => membership.org.plan === "agency")) {
    items.splice(1, 0, { key: "agency", href: "/agency", label: t.t("navigation", "agency"), accent: true });
  }
  if (enterpriseOrg) {
    items.splice(1, 0, { key: "enterprise", href: `/enterprise?orgId=${enterpriseOrg.id}`, label: t.t("navigation", "enterprise"), accent: true });
  }
  if (isFounder(ctx)) {
    items.push({ key: "evolution", href: "/evolution", label: t.t("navigation", "evolution") });
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line bg-base-950/85 backdrop-blur-md">
        <div className={`mx-auto flex ${width} flex-col items-start gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6`}>
          <Link href="/account" aria-label={t.t("ui", "goToOverview")}><Wordmark className="h-6" /></Link>
          <nav aria-label={t.t("ui", "primaryNavigation")} className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1">
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
              {t.t("navigation", "newScan")}
            </Link>
            {actions}
            <LanguageSwitcher current={locale} label={t.t("common", "changeLanguage")} />
            <LogoutButton />
          </nav>
        </div>
      </header>
      <main className={`mx-auto ${width} px-4 py-8 sm:px-6`}>{children}</main>
    </div>
  );
}
