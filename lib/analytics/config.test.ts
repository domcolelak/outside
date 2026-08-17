import { describe, expect, it } from "vitest";
import { ANALYTICS_BEFORE_SEND_SOURCE, webAnalyticsConfig } from "./config";

const websiteId = "1dfc6b8f-5c21-4ce8-9f30-a3e21dc011bc";

describe("webAnalyticsConfig", () => {
  it("enables analytics for a valid UUID and canonical HTTPS origin", () => {
    expect(webAnalyticsConfig({ UMAMI_WEBSITE_ID: websiteId, APP_URL: "https://OutsideGuardian.eu" })).toEqual({
      websiteId,
      domain: "outsideguardian.eu",
    });
  });

  it("permits local HTTP development", () => {
    expect(webAnalyticsConfig({ UMAMI_WEBSITE_ID: websiteId, APP_URL: "http://localhost:3000" })).toEqual({
      websiteId,
      domain: "localhost",
    });
  });

  it.each([
    { UMAMI_WEBSITE_ID: "", APP_URL: "https://outsideguardian.eu" },
    { UMAMI_WEBSITE_ID: "not-a-uuid", APP_URL: "https://outsideguardian.eu" },
    { UMAMI_WEBSITE_ID: websiteId, APP_URL: "http://outsideguardian.eu" },
    { UMAMI_WEBSITE_ID: websiteId, APP_URL: "ftp://localhost" },
    { UMAMI_WEBSITE_ID: websiteId, APP_URL: "https://outsideguardian.eu/unexpected-path" },
    { UMAMI_WEBSITE_ID: websiteId, APP_URL: "not-a-url" },
  ])("fails closed for malformed configuration", (env) => {
    expect(webAnalyticsConfig(env)).toBeNull();
  });
});

describe("analytics URL minimization", () => {
  function sanitizer() {
    const browserWindow: { outsideAnalyticsBeforeSend?: (type: string, payload: Record<string, string>) => Record<string, string> | false } = {};
    Function("window", "location", ANALYTICS_BEFORE_SEND_SOURCE)(browserWindow, {
      origin: "https://outsideguardian.eu",
      href: "https://outsideguardian.eu/",
    });
    return browserWindow.outsideAnalyticsBeforeSend!;
  }

  it("removes query strings, fragments and internal referrer parameters", () => {
    expect(sanitizer()("event", {
      url: "https://outsideguardian.eu/pricing?utm_source=linkedin#plans",
      referrer: "https://outsideguardian.eu/?email=private@example.com",
    })).toEqual({ url: "/pricing", referrer: "/" });
  });

  it("reduces an external referrer to its origin", () => {
    expect(sanitizer()("event", {
      url: "/pricing",
      referrer: "https://example.com/private/path?campaign=secret",
    })).toEqual({ url: "/pricing", referrer: "https://example.com" });
  });

  it.each(["/r/private-token", "/invite/private-token", "/reset-password"])("rejects sensitive route %s", (url) => {
    expect(sanitizer()("event", { url })).toBe(false);
  });
});
