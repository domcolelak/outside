import { describe, expect, it } from "vitest";
import { subscriptionPlan } from "./plans";

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
