import { NextRequest, NextResponse } from "next/server";
import { getSessionContext, hasOrgRole } from "@/lib/auth";
import { APP_URL, getStripe, isBillingEnabled } from "@/lib/billing/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Open the Stripe billing portal for an org's customer (manage/cancel/upgrade). */
export async function POST(req: NextRequest) {
  if (!isBillingEnabled()) return NextResponse.json({ error: "Billing is not configured." }, { status: 503 });
  const stripe = getStripe()!;

  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { orgId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const orgId = String(body.orgId ?? "");
  const membership = ctx.memberships.find((m) => m.org.id === orgId);
  if (!membership || !hasOrgRole(ctx, orgId, "admin")) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  if (!membership.org.stripeCustomerId) {
    return NextResponse.json({ error: "No billing account yet. Choose a plan first." }, { status: 409 });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: membership.org.stripeCustomerId,
    return_url: `${APP_URL}/account`,
  });
  return NextResponse.json({ url: session.url });
}
