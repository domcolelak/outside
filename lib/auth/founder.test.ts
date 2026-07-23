import { afterEach, describe, expect, it, vi } from "vitest";
import { isFounder } from "./founder";
import type { SessionContext } from "./model";

function ctx(email: string): SessionContext {
  return { user: { email }, memberships: [] } as unknown as SessionContext;
}

afterEach(() => vi.unstubAllEnvs());

describe("founder authorization (Evolution control plane)", () => {
  it("allows only allow-listed emails, case-insensitively and trimmed", () => {
    vi.stubEnv("OUTSIDE_FOUNDER_EMAILS", " Founder@Outside.eu , other@x.com ");
    expect(isFounder(ctx("founder@outside.eu"))).toBe(true);
    expect(isFounder(ctx("FOUNDER@OUTSIDE.EU"))).toBe(true);
    expect(isFounder(ctx("other@x.com"))).toBe(true);
    expect(isFounder(ctx("random@customer.com"))).toBe(false);
  });

  it("denies everyone in production when the allowlist is unset (safe default)", () => {
    vi.stubEnv("OUTSIDE_FOUNDER_EMAILS", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(isFounder(ctx("anyone@x.com"))).toBe(false);
  });

  it("is open in development when unset, for local work", () => {
    vi.stubEnv("OUTSIDE_FOUNDER_EMAILS", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(isFounder(ctx("dev@local"))).toBe(true);
  });

  it("denies an unauthenticated session outright", () => {
    vi.stubEnv("OUTSIDE_FOUNDER_EMAILS", "founder@outside.eu");
    expect(isFounder(null)).toBe(false);
  });
});
