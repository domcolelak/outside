/**
 * Plan catalog. Prices map to Stripe Price IDs via env so the same code runs in
 * test and live mode. Limits are enforced server-side (never trust the client).
 */

import type { Organization } from "@/lib/auth/model";

export type PlanId = Organization["plan"];

export interface Plan {
  id: PlanId;
  name: string;
  priceMonthly: number;
  monitorLimit: number;
  scanFrequency: string;
  /**
   * Catalog keys for the plan's selling points, resolved where a plan is shown.
   * The wording lives in messages/<locale>/billing.json; this record is read
   * server-side by pricing and limit logic, where there is no language to
   * render in.
   */
  featureKeys: string[];
  stripePriceId?: string;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Snapshot",
    priceMonthly: 0,
    monitorLimit: 1,
    scanFrequency: "on demand",
    featureKeys: ["freeFeature1", "freeFeature2", "freeFeature3", "freeFeature4"],
  },
  professional: {
    id: "professional",
    name: "Professional",
    priceMonthly: 79,
    monitorLimit: 5,
    scanFrequency: "daily",
    featureKeys: ["professionalFeature1", "professionalFeature2", "professionalFeature3", "professionalFeature4", "professionalFeature5"],
    stripePriceId: process.env.STRIPE_PRICE_PROFESSIONAL,
  },
  agency: {
    id: "agency",
    name: "Agency",
    priceMonthly: 249,
    monitorLimit: 30,
    scanFrequency: "daily",
    featureKeys: ["agencyFeature1", "agencyFeature2", "agencyFeature3", "agencyFeature4", "agencyFeature5"],
    stripePriceId: process.env.STRIPE_PRICE_AGENCY,
  },
};

/** Reverse lookup used by the subscription webhook. */
export function planForPriceId(priceId: string | undefined | null): PlanId | null {
  if (!priceId) return null;
  for (const plan of Object.values(PLANS)) {
    if (plan.stripePriceId && plan.stripePriceId === priceId) return plan.id;
  }
  return null;
}

/** Unknown prices fail closed instead of silently granting a paid plan. */
export function subscriptionPlan(priceId: string | undefined | null, status: string): PlanId {
  if (status !== "active" && status !== "trialing") return "free";
  return planForPriceId(priceId) ?? "free";
}
