import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import type Stripe from "stripe";
import { getAuthStore } from "@/lib/auth";
import { getStripe, isBillingEnabled } from "@/lib/billing/stripe";
import { planForPriceId, subscriptionPlan } from "@/lib/billing/plans";
import { processWebhookOnce } from "@/lib/billing/idempotency";
import { operationalLog } from "@/lib/observability/log";
import { billingEventRank } from "@/lib/billing/order";
import { recordBillingWebhook } from "@/lib/observability/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function orgIdFor(tx: Prisma.TransactionClient, metadataId: string | undefined, customerId: string | undefined) {
  if (metadataId) return (await tx.organization.findUnique({ where: { id: metadataId }, select: { id: true } }))?.id ?? null;
  if (!customerId) return null;
  return (await tx.organization.findUnique({ where: { stripeCustomerId: customerId }, select: { id: true } }))?.id ?? null;
}

async function processDurable(tx: Prisma.TransactionClient, event: Stripe.Event): Promise<void> {
  const rank = billingEventRank(event.type);
  const eligible = Prisma.sql`("stripeEventCreated" IS NULL OR "stripeEventCreated" < ${event.created} OR ("stripeEventCreated" = ${event.created} AND "stripeEventRank" < ${rank}))`;
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const orgId = await orgIdFor(tx, session.metadata?.orgId, session.customer as string | undefined);
    const plan = session.metadata?.plan;
    if (orgId && (plan === "professional" || plan === "agency")) await tx.$executeRaw`UPDATE organizations SET plan=CAST(${plan} AS "Plan"),"stripeCustomerId"=${session.customer as string},"stripeSubscriptionId"=${session.subscription as string},"subscriptionStatus"='active',"stripeEventCreated"=${event.created},"stripeEventRank"=${rank},"stripeEventId"=${event.id} WHERE id=${orgId} AND ${eligible}`;
  } else if (event.type === "customer.subscription.updated") {
    const subscription = event.data.object as Stripe.Subscription;
    const orgId = await orgIdFor(tx, subscription.metadata?.orgId, subscription.customer as string);
    const priceId = subscription.items.data[0]?.price.id;
    const plan = subscriptionPlan(priceId, subscription.status);
    if (!planForPriceId(priceId) && (subscription.status === "active" || subscription.status === "trialing")) {
      operationalLog("error", "billing.unknown_subscription_price", { eventType: event.type, priceId: priceId ?? "missing" });
    }
    if (orgId) await tx.$executeRaw`UPDATE organizations SET plan=CAST(${plan} AS "Plan"),"stripeSubscriptionId"=${subscription.id},"subscriptionStatus"=${subscription.status},"stripeEventCreated"=${event.created},"stripeEventRank"=${rank},"stripeEventId"=${event.id} WHERE id=${orgId} AND ${eligible}`;
  } else if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const orgId = await orgIdFor(tx, subscription.metadata?.orgId, subscription.customer as string);
    if (orgId) await tx.$executeRaw`UPDATE organizations SET plan=CAST(${"free"} AS "Plan"),"stripeSubscriptionId"=NULL,"subscriptionStatus"='canceled',"stripeEventCreated"=${event.created},"stripeEventRank"=${rank},"stripeEventId"=${event.id} WHERE id=${orgId} AND ${eligible}`;
  } else if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    const customerId = invoice.customer as string;
    const orgId = await orgIdFor(tx, undefined, customerId);
    if (orgId) await tx.$executeRaw`UPDATE organizations SET "subscriptionStatus"='past_due',"stripeEventCreated"=${event.created},"stripeEventRank"=${rank},"stripeEventId"=${event.id} WHERE id=${orgId} AND ${eligible}`;
  }
}

async function processMemory(event: Stripe.Event): Promise<void> {
  const auth = await getAuthStore();
  const customer = (event.data.object as { customer?: string | null }).customer ?? undefined;
  const metadata = (event.data.object as { metadata?: { orgId?: string; plan?: string } }).metadata;
  const org = customer && auth.findOrgByStripeCustomer ? await auth.findOrgByStripeCustomer(customer) : null;
  const orgId = metadata?.orgId ?? org?.id;
  if (!orgId || !auth.setSubscription) return;
  if (event.type === "checkout.session.completed" && (metadata?.plan === "professional" || metadata?.plan === "agency")) {
    const session = event.data.object as Stripe.Checkout.Session;
    await auth.setSubscription(orgId, { plan: metadata.plan, stripeCustomerId: customer, stripeSubscriptionId: session.subscription as string, status: "active" });
  } else if (event.type === "customer.subscription.updated") {
    const subscription = event.data.object as Stripe.Subscription;
    const priceId = subscription.items.data[0]?.price.id;
    const plan = subscriptionPlan(priceId, subscription.status);
    if (!planForPriceId(priceId) && (subscription.status === "active" || subscription.status === "trialing")) {
      operationalLog("error", "billing.unknown_subscription_price", { eventType: event.type, priceId: priceId ?? "missing" });
    }
    await auth.setSubscription(orgId, { plan, stripeSubscriptionId: subscription.id, status: subscription.status });
  } else if (event.type === "customer.subscription.deleted") {
    await auth.setSubscription(orgId, { plan: "free", stripeSubscriptionId: null, status: "canceled" });
  } else if (event.type === "invoice.payment_failed") {
    await auth.setSubscription(orgId, { plan: org?.plan ?? "free", status: "past_due" });
  }
}

export async function POST(req: NextRequest) {
  if (!isBillingEnabled()) return NextResponse.json({ error: "Billing not configured" }, { status: 503 });
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook secret not configured" }, { status: 503 });
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > 1_000_000) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  const raw = await req.text();
  if (Buffer.byteLength(raw) > 1_000_000) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  let event: Stripe.Event;
  try { event = getStripe()!.webhooks.constructEvent(raw, req.headers.get("stripe-signature") ?? "", secret); }
  catch { return NextResponse.json({ error: "Signature verification failed" }, { status: 400 }); }

  try {
    const outcome = await processWebhookOnce(event.id, (tx) => tx ? processDurable(tx, event) : processMemory(event));
    recordBillingWebhook(event.type, outcome);
    return NextResponse.json({ received: true, duplicate: outcome === "duplicate" });
  } catch (error) {
    recordBillingWebhook(event.type, "failed");
    operationalLog("error", "billing.webhook_failed", { eventType: event.type }, error);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }
}
