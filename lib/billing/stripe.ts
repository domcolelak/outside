/**
 * Stripe client accessor. Billing is optional: without STRIPE_SECRET_KEY the
 * product runs fully (free plan only) and billing endpoints report that billing
 * is not configured rather than erroring.
 */

import Stripe from "stripe";

let client: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (client) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  // Use the SDK's pinned API version (avoids drift with the installed types).
  client = new Stripe(key);
  return client;
}

export function isBillingEnabled(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
