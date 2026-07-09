import { NextRequest, NextResponse } from "next/server";
import { getAuthStore, getSessionContext, hasOrgRole } from "@/lib/auth";
import { PLANS, type PlanId } from "@/lib/billing/plans";
import { APP_URL, getStripe, isBillingEnabled } from "@/lib/billing/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isBillingEnabled()) return NextResponse.json({ error: "Billing is not configured." }, { status: 503 });
  const stripe = getStripe()!;

  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { orgId?: string; plan?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const orgId = String(body.orgId ?? "");
  const membership = ctx.memberships.find((m) => m.org.id === orgId);
  // Only owners/admins can change billing.
  if (!membership || !hasOrgRole(ctx, orgId, "admin")) {
    return NextResponse.json({ error: "Admin access required to manage billing." }, { status: 403 });
  }

  const planId = body.plan as PlanId;
  const plan = PLANS[planId];
  if (!plan || !plan.stripePriceId) {
    return NextResponse.json({ error: "Unknown or unconfigured plan." }, { status: 422 });
  }

  const auth = await getAuthStore();

  // Ensure the org has a Stripe customer.
  let customerId = membership.org.stripeCustomerId ?? undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: ctx.user.email,
      name: membership.org.name,
      metadata: { orgId },
    });
    customerId = customer.id;
    await auth.setSubscription?.(orgId, { plan: membership.org.plan, stripeCustomerId: customerId });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    success_url: `${APP_URL}/account?billing=success`,
    cancel_url: `${APP_URL}/billing?billing=cancelled`,
    client_reference_id: orgId,
    metadata: { orgId, plan: planId },
    subscription_data: { metadata: { orgId, plan: planId } },
  });

  return NextResponse.json({ url: session.url });
}
