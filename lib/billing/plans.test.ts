import { describe, expect, it } from "vitest";
import { PLANS, subscriptionPlan } from "./plans";
import { LOCALES } from "@/lib/i18n/locales";
import { getTranslator, type MessageKey } from "@/lib/i18n/messages";

describe("subscription plan resolution", () => {
  it("fails closed for unknown active prices", () => {
    expect(subscriptionPlan("price_not_configured", "active")).toBe("free");
    expect(subscriptionPlan(undefined, "trialing")).toBe("free");
  });

  it("keeps inactive subscriptions on the free plan", () => {
    expect(subscriptionPlan("price_not_configured", "past_due")).toBe("free");
    expect(subscriptionPlan("price_not_configured", "canceled")).toBe("free");
  });
});

/**
 * Plan copy is the page where money changes hands, so an untranslated string
 * there costs more than one anywhere else. The plan record holds keys rather
 * than sentences, because pricing and limit logic read it server-side where
 * there is no language to render in.
 */
describe("plan feature copy", () => {
  it("resolves every plan's selling points in every language", () => {
    for (const plan of Object.values(PLANS)) {
      for (const { code } of LOCALES) {
        const t = getTranslator(code);
        for (const key of plan.featureKeys) {
          const text = t.t("billing", key as MessageKey<"billing">);
          expect(text, `${plan.id}/${key} is missing in ${code}`).not.toBe(key);
          expect(text.trim().length, `${plan.id}/${key} is empty in ${code}`).toBeGreaterThan(2);
        }
      }
    }
  });

  it("gives each plan a distinct set of keys", () => {
    // A copy-paste that leaves two plans sharing a key would show the same
    // selling points on both, which reads as a pricing mistake.
    const seen = new Set<string>();
    for (const plan of Object.values(PLANS)) {
      for (const key of plan.featureKeys) {
        expect(seen.has(key), `${key} is used by more than one plan`).toBe(false);
        seen.add(key);
      }
    }
  });

  it("keeps the paid plans priced and wired to Stripe", () => {
    // Guards the edit that removes a price id while rearranging plan copy.
    expect(PLANS.free.stripePriceId).toBeUndefined();
    expect(PLANS.professional.priceMonthly).toBeGreaterThan(0);
    expect(PLANS.agency.priceMonthly).toBeGreaterThan(PLANS.professional.priceMonthly);
  });
});
