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
  features: string[];
  stripePriceId?: string;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Snapshot",
    priceMonthly: 0,
    monitorLimit: 1,
    scanFrequency: "on demand",
    features: ["Single external snapshot", "Interactive asset graph", "Attacker View replay", "Top findings"],
  },
  professional: {
    id: "professional",
    name: "Professional",
    priceMonthly: 79,
    monitorLimit: 5,
    scanFrequency: "daily",
    features: ["Up to 5 monitored domains", "Daily scans & change alerts", "Full findings & evidence", "Protection posture history", "PDF reports"],
    stripePriceId: process.env.STRIPE_PRICE_PROFESSIONAL,
  },
  agency: {
    id: "agency",
    name: "Agency",
    priceMonthly: 249,
    monitorLimit: 30,
    scanFrequency: "daily",
    features: ["Up to 30 client domains", "Team roles & workspaces", "Scheduled reporting", "Priority discovery", "API access"],
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
