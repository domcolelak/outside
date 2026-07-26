import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyKey, subscribedDomains, searchDomain, looksLikeHibpKey } from "./hibp";

afterEach(() => vi.restoreAllMocks());

function stub(status: number, body: unknown, headers: Record<string, string> = {}) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(status === 404 ? "" : JSON.stringify(body), { status, headers })));
}
function capture() {
  const fn = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ SubscriptionName: "Pwned 5" }), { status: 200 }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("HIBP key format", () => {
  it("accepts a 32-hex key (incl. the test key) and rejects others", () => {
    expect(looksLikeHibpKey("00000000000000000000000000000000")).toBe(true);
    expect(looksLikeHibpKey("deadBEEFdeadBEEFdeadBEEFdeadBEEF")).toBe(true);
    expect(looksLikeHibpKey("too-short")).toBe(false);
    expect(looksLikeHibpKey("g".repeat(32))).toBe(false);
  });
});

describe("HIBP adapter — required headers", () => {
  it("sends the api key and a user-agent on every request", async () => {
    const fetchMock = capture();
    await verifyKey("00000000000000000000000000000000");
    const headers = (fetchMock.mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>;
    expect(headers["hibp-api-key"]).toBe("00000000000000000000000000000000");
    expect(headers["user-agent"]).toBe("OUTSIDE-Guardian");
  });
});

describe("verifyKey — status mapping", () => {
  it("returns the subscription on 200", async () => {
    stub(200, { SubscriptionName: "Pwned 5", DomainSearchMaxBreachedAccounts: 100000, SubscribedUntil: "2027-01-01T00:00:00Z" });
    const result = await verifyKey("k");
    expect(result).toMatchObject({ ok: true, subscription: { subscriptionName: "Pwned 5", domainSearchMaxBreachedAccounts: 100000 } });
  });

  it("maps 401 to invalid_key, 403 to forbidden, 429 to rate_limited, 503 to unavailable", async () => {
    stub(401, {}); expect(await verifyKey("k")).toMatchObject({ ok: false, code: "invalid_key" });
    stub(403, {}); expect(await verifyKey("k")).toMatchObject({ ok: false, code: "forbidden" });
    stub(429, {}, { "retry-after": "30" }); expect(await verifyKey("k")).toMatchObject({ ok: false, code: "rate_limited", retryAfterSeconds: 30 });
    stub(503, {}); expect(await verifyKey("k")).toMatchObject({ ok: false, code: "unavailable" });
  });

  it("never leaks the key in the error message", async () => {
    stub(401, {});
    const result = await verifyKey("super-secret-key-value");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).not.toContain("super-secret-key-value");
  });
});

describe("subscribedDomains", () => {
  it("lists the domains the key can search", async () => {
    stub(200, [{ DomainName: "acme.com" }, { DomainName: "acme.io" }]);
    expect(await subscribedDomains("k")).toEqual({ ok: true, domains: ["acme.com", "acme.io"] });
  });
  it("treats 404 as an empty list, not an error", async () => {
    stub(404, null);
    expect(await subscribedDomains("k")).toEqual({ ok: true, domains: [] });
  });
});

describe("searchDomain", () => {
  it("returns breached accounts on 200", async () => {
    stub(200, { alice: ["Adobe", "LinkedIn"], bob: ["Dropbox"] });
    const result = await searchDomain("k", "acme.com");
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.accounts).toEqual([{ alias: "alice", breaches: ["Adobe", "LinkedIn"] }, { alias: "bob", breaches: ["Dropbox"] }]);
  });
  it("treats 404 as a clean result (no breaches), not an integration error", async () => {
    stub(404, null);
    expect(await searchDomain("k", "acme.com")).toEqual({ ok: true, accounts: [] });
  });
  it("maps 403 (unverified domain / plan) to forbidden", async () => {
    stub(403, {});
    expect(await searchDomain("k", "acme.com")).toMatchObject({ ok: false, code: "forbidden" });
  });
});
