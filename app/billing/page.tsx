import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { PLANS } from "@/lib/billing/plans";
import { isBillingEnabled } from "@/lib/billing/stripe";
import { CheckoutButton, ManageBillingButton } from "@/components/account/BillingActions";
import { currentLocale } from "@/lib/i18n/server";
import { getTranslator, type MessageKey } from "@/lib/i18n/messages";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");

  const membership = ctx.memberships[0];
  const org = membership?.org;
  const billingOn = isBillingEnabled();
  const { locale } = await currentLocale();
  const t = getTranslator(locale);
  const b = (key: MessageKey<"billing">, values?: Record<string, string | number>) => t.t("billing", key, values);
  // Plan names are product names; the catalog holds them so casing stays fixed.
  const planName = (id: string) => b((id === "free" ? "planSnapshot" : id === "professional" ? "planProfessional" : "planAgency"));

  return (
    <>
        <div className="flex items-end justify-between">
          <div>
            <div className="mono text-[12px] uppercase tracking-widest text-signal">{b("kicker")}</div>
            <h1 className="mt-2 text-3xl font-semibold text-ink">{b("title")}</h1>
            {org && <p className="mt-1 text-sm text-ink-soft">{b("currentPlanLine", { organization: org.name, plan: planName(org.plan) })}{org.subscriptionStatus && org.subscriptionStatus !== "active" ? ` · ${org.subscriptionStatus}` : ""}</p>}
          </div>
          {org?.stripeCustomerId && billingOn && <ManageBillingButton orgId={org.id} />}
        </div>

        {!billingOn && (
          <div className="mt-6 rounded-lg border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-accent">
            {b("notConfigured")}
          </div>
        )}

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {Object.values(PLANS).map((plan) => {
            const current = org?.plan === plan.id;
            return (
              <div key={plan.id} className={`panel p-6 ${current ? "ring-1 ring-signal/40" : ""}`}>
                <div className="text-ink">{planName(plan.id)}</div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-3xl font-semibold text-ink">${plan.priceMonthly}</span>
                  <span className="mono text-xs text-ink-faint">{b("perMonth")}</span>
                </div>
                <ul className="mt-5 space-y-2 text-sm text-ink-soft">
                  {plan.featureKeys.map((key) => (
                    <li key={key} className="flex items-start gap-2"><span className="mt-0.5 text-signal">›</span>{b(key as MessageKey<"billing">)}</li>
                  ))}
                </ul>
                <div className="mt-6">
                  {plan.id === "free" ? (
                    <div className="mono rounded-lg border border-line py-2 text-center text-xs text-ink-faint">{current ? b("currentPlan") : b("included")}</div>
                  ) : billingOn && org ? (
                    <CheckoutButton orgId={org.id} plan={plan.id} current={current} label={org.plan === "free" ? b("upgrade") : b("switchPlan")} />
                  ) : (
                    <div className="mono rounded-lg border border-line py-2 text-center text-xs text-ink-faint">{b("checkoutDisabled")}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </>
  );
}
