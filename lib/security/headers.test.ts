import { describe, expect, it } from "vitest";
// The runtime module is plain ESM so next.config.mjs can load it directly.
// @ts-expect-error JavaScript config helper intentionally has no generated declarations.
import { createSecurityHeaders } from "./headers.mjs";

describe("security headers", () => {
  it("sets a restrictive baseline CSP", () => {
    const headers = new Map(createSecurityHeaders(false).map((header: { key: string; value: string }) => [header.key, header.value]));
    expect(headers.get("Content-Security-Policy")).toContain("default-src 'self'");
    expect(headers.get("Content-Security-Policy")).toContain("object-src 'none'");
    expect(headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(headers.get("Content-Security-Policy")).toContain("'unsafe-eval'");
    expect(headers.has("Strict-Transport-Security")).toBe(false);
  });

  it("enables long-lived HSTS only for production", () => {
    const headers = new Map(createSecurityHeaders(true).map((header: { key: string; value: string }) => [header.key, header.value]));
    expect(headers.get("Strict-Transport-Security")).toContain("max-age=63072000");
    expect(headers.get("Strict-Transport-Security")).toContain("includeSubDomains");
    expect(headers.get("Content-Security-Policy")).not.toContain("'unsafe-eval'");
  });
});
