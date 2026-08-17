import { afterEach, describe, expect, it, vi } from "vitest";
import { trackProductEvent } from "./client";

afterEach(() => vi.unstubAllGlobals());

describe("browser product analytics", () => {
  it("does nothing when the deployment has not enabled analytics", () => {
    const track = vi.fn();
    vi.stubGlobal("window", { umami: { track } });
    trackProductEvent("signup_started", { mode: "product" });
    expect(track).not.toHaveBeenCalled();
  });

  it("allows only validated campaign codes and known UTM keys", () => {
    const track = vi.fn();
    vi.stubGlobal("window", { __outsideAnalyticsConfigured: true, umami: { track } });
    trackProductEvent("campaign_visit", {
      utm_source: "linkedin",
      utm_campaign: "founder_sale-2026",
      email: "private@example.com",
      utm_term: "invalid value with spaces",
    });
    expect(track).toHaveBeenCalledWith("campaign_visit", {
      utm_source: "linkedin",
      utm_campaign: "founder_sale-2026",
    });
  });

  it("drops arbitrary funnel properties", () => {
    const track = vi.fn();
    vi.stubGlobal("window", { __outsideAnalyticsConfigured: true, umami: { track } });
    trackProductEvent("signup_completed", { mode: "product", email: "private@example.com" });
    expect(track).toHaveBeenCalledWith("signup_completed", { mode: "product" });
  });

  it("allows only purchasable plan names", () => {
    const track = vi.fn();
    vi.stubGlobal("window", { __outsideAnalyticsConfigured: true, umami: { track } });
    trackProductEvent("checkout_started", { plan: "professional", orgId: "private-org" });
    expect(track).toHaveBeenCalledWith("checkout_started", { plan: "professional" });
  });
});
