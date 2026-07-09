import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { PLANS } from "@/lib/billing/plans";
import { isBillingEnabled } from "@/lib/billing/stripe";
import { Wordmark } from "@/components/Wordmark";
import { CheckoutButton, ManageBillingButton } from "@/components/account/BillingActions";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");

  const membership = ctx.memberships[0];
  const org = membership?.org;
  const billingOn = isBillingEnabled();

  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/"><Wordmark className="h-6" /></Link>
          <Link href="/account" className="mono text-xs text-ink-soft hover:text-ink">← Account</Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex items-end justify-between">
          <div>
            <div className="mono text-[11px] uppercase tracking-widest text-signal">Billing</div>
            <h1 className="mt-2 text-3xl font-semibold text-ink">Plans & subscription</h1>
            {org && <p className="mt-1 text-sm text-ink-soft">{org.name} · current plan: <span className="text-ink">{PLANS[org.plan].name}</span>{org.subscriptionStatus && org.subscriptionStatus !== "active" ? ` · ${org.subscriptionStatus}` : ""}</p>}
          </div>
          {org?.stripeCustomerId && billingOn && <ManageBillingButton orgId={org.id} />}
        </div>

        {!billingOn && (
          <div className="mt-6 rounded-lg border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-accent">
            Billing is not configured on this deployment (no Stripe keys). Plans are shown for reference; the free plan is fully active. Set STRIPE_SECRET_KEY, price IDs, and the webhook secret to enable checkout.
          </div>
        )}

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {Object.values(PLANS).map((plan) => {
            const current = org?.plan === plan.id;
            return (
              <div key={plan.id} className={`panel p-6 ${current ? "ring-1 ring-signal/40" : ""}`}>
                <div className="text-ink">{plan.name}</div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-3xl font-semibold text-ink">${plan.priceMonthly}</span>
                  <span className="mono text-xs text-ink-faint">/mo</span>
                </div>
                <ul className="mt-5 space-y-2 text-sm text-ink-soft">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2"><span className="mt-0.5 text-signal">›</span>{f}</li>
                  ))}
                </ul>
                <div className="mt-6">
                  {plan.id === "free" ? (
                    <div className="mono rounded-lg border border-line py-2 text-center text-xs text-ink-faint">{current ? "Current plan" : "Included"}</div>
                  ) : billingOn && org ? (
                    <CheckoutButton orgId={org.id} plan={plan.id} current={current} label={org.plan === "free" ? "Upgrade" : "Switch plan"} />
                  ) : (
                    <div className="mono rounded-lg border border-line py-2 text-center text-xs text-ink-faint">Checkout disabled</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
