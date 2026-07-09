import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getAuthStore } from "@/lib/auth";
import { getStripe, isBillingEnabled } from "@/lib/billing/stripe";
import { planForPriceId } from "@/lib/billing/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// In-memory idempotency guard. NOTE: for multi-instance production, back this
// with a durable store (a processed_events table) — documented in ROADMAP.
const processed = new Set<string>();

async function resolveOrgId(auth: Awaited<ReturnType<typeof getAuthStore>>, metaOrgId: string | undefined, customerId: string | undefined): Promise<string | null> {
  if (metaOrgId) return metaOrgId;
  if (customerId && auth.findOrgByStripeCustomer) {
    const org = await auth.findOrgByStripeCustomer(customerId);
    return org?.id ?? null;
  }
  return null;
}

export async function POST(req: NextRequest) {
  if (!isBillingEnabled()) return NextResponse.json({ error: "Billing not configured" }, { status: 503 });
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook secret not configured" }, { status: 503 });

  const stripe = getStripe()!;
  const sig = req.headers.get("stripe-signature") ?? "";
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    return NextResponse.json({ error: `Signature verification failed: ${(err as Error).message}` }, { status: 400 });
  }

  // Idempotency: acknowledge duplicates without reprocessing.
  if (processed.has(event.id)) return NextResponse.json({ received: true, duplicate: true });
  processed.add(event.id);

  const auth = await getAuthStore();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const orgId = await resolveOrgId(auth, s.metadata?.orgId, s.customer as string);
        const plan = (s.metadata?.plan as "professional" | "agency") ?? null;
        if (orgId && plan) {
          await auth.setSubscription?.(orgId, { plan, stripeCustomerId: s.customer as string, stripeSubscriptionId: s.subscription as string, status: "active" });
        }
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const orgId = await resolveOrgId(auth, sub.metadata?.orgId, sub.customer as string);
        const priceId = sub.items.data[0]?.price.id;
        const plan = planForPriceId(priceId) ?? "professional";
        const active = sub.status === "active" || sub.status === "trialing";
        if (orgId) {
          await auth.setSubscription?.(orgId, { plan: active ? plan : "free", stripeSubscriptionId: sub.id, status: sub.status });
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const orgId = await resolveOrgId(auth, sub.metadata?.orgId, sub.customer as string);
        if (orgId) {
          await auth.setSubscription?.(orgId, { plan: "free", stripeSubscriptionId: null, status: "canceled" });
        }
        break;
      }
      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        const orgId = await resolveOrgId(auth, undefined, inv.customer as string);
        if (orgId) {
          // Keep the plan but flag the org so the UI can prompt for payment update.
          const org = auth.findOrgByStripeCustomer ? await auth.findOrgByStripeCustomer(inv.customer as string) : null;
          await auth.setSubscription?.(orgId, { plan: org?.plan ?? "free", status: "past_due" });
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error(`[stripe] handler error for ${event.type}:`, (err as Error).message);
    // Let Stripe retry.
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
