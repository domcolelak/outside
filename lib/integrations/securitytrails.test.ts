import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyKey, accountUsage, looksLikeSecurityTrailsKey } from "./securitytrails";

afterEach(() => vi.restoreAllMocks());

function stub(status: number, body: unknown, headers: Record<string, string> = {}) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body === null ? "" : JSON.stringify(body), { status, headers })));
}

describe("SecurityTrails key format", () => {
  it("accepts a long alphanumeric key and rejects obvious rubbish", () => {
    expect(looksLikeSecurityTrailsKey("A1b2C3d4E5f6G7h8")).toBe(true);
    expect(looksLikeSecurityTrailsKey("short")).toBe(false);
    expect(looksLikeSecurityTrailsKey("has spaces in it here")).toBe(false);
    expect(looksLikeSecurityTrailsKey("bad$chars!" + "x".repeat(20))).toBe(false);
  });
});

describe("SecurityTrails adapter — auth header", () => {
  it("sends the key in the apikey header", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ success: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await verifyKey("secret-key-value-1234");
    const headers = (fetchMock.mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>;
    expect(headers.apikey).toBe("secret-key-value-1234");
  });
});

describe("verifyKey — status mapping", () => {
  it("succeeds on a successful ping", async () => {
    stub(200, { success: true });
    expect(await verifyKey("k")).toMatchObject({ ok: true });
  });

  it("maps 401 to invalid_key, 403 to forbidden, 429 to rate_limited, 5xx to unavailable", async () => {
    stub(401, null); expect(await verifyKey("k")).toMatchObject({ ok: false, code: "invalid_key" });
    stub(403, null); expect(await verifyKey("k")).toMatchObject({ ok: false, code: "forbidden" });
    stub(429, null, { "retry-after": "60" }); expect(await verifyKey("k")).toMatchObject({ ok: false, code: "rate_limited", retryAfterSeconds: 60 });
    stub(503, null); expect(await verifyKey("k")).toMatchObject({ ok: false, code: "unavailable" });
  });

  it("never leaks the key in the error message", async () => {
    stub(401, null);
    const result = await verifyKey("super-secret-key-value");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).not.toContain("super-secret-key-value");
  });
});

describe("accountUsage", () => {
  it("reads the monthly allowance and current usage", async () => {
    stub(200, { allowed_monthly_usage: 50, current_monthly_usage: 12 });
    expect(await accountUsage("k")).toMatchObject({ ok: true, usage: { allowed: 50, used: 12 } });
  });

  it("tolerates a plan that does not report a quota", async () => {
    stub(200, {});
    expect(await accountUsage("k")).toMatchObject({ ok: true, usage: { allowed: null, used: null } });
  });
});
