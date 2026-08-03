import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyKey, looksLikeVirusTotalKey } from "./virustotal";
import { virusTotalProvider } from "./providers/virustotal";

afterEach(() => vi.restoreAllMocks());

const KEY = "a".repeat(64);

/** Route the two calls verifyKey makes: the user object, then overall quotas. */
function stubAccount(user: unknown, quotas: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).includes("overall_quotas")
        ? new Response(JSON.stringify(quotas), { status: 200 })
        : new Response(status === 200 ? JSON.stringify(user) : "", { status }),
    ),
  );
}

describe("VirusTotal key format", () => {
  it("accepts 64 hex characters and rejects anything else", () => {
    expect(looksLikeVirusTotalKey(KEY)).toBe(true);
    expect(looksLikeVirusTotalKey("a".repeat(63))).toBe(false);
    expect(looksLikeVirusTotalKey("z".repeat(64))).toBe(false);
  });
});

describe("verifyKey", () => {
  it("sends the key in the x-apikey header", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ data: { attributes: {} } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await verifyKey(KEY);
    expect(((fetchMock.mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>)["x-apikey"]).toBe(KEY);
  });

  it("reports the plan, daily quota and a privileged entitlement", async () => {
    stubAccount(
      { data: { attributes: { user_type: "premium", privileges: { intelligence: { granted: true } } } } },
      { data: { api_requests_daily: { user: { allowed: 1000, used: 40 } } } },
    );
    expect(await verifyKey(KEY)).toMatchObject({
      ok: true,
      account: { plan: "premium", dailyAllowed: 1000, dailyUsed: 40, privileged: true },
    });
  });

  it("does not claim a privileged entitlement for a free key", async () => {
    stubAccount({ data: { attributes: { user_type: "public", privileges: { intelligence: { granted: false } } } } }, {});
    const result = await verifyKey(KEY);
    expect(result).toMatchObject({ ok: true, account: { privileged: false } });
  });

  it("reports an unknown quota as unknown rather than zero", async () => {
    stubAccount({ data: { attributes: {} } }, { data: {} });
    expect(await verifyKey(KEY)).toMatchObject({ ok: true, account: { dailyAllowed: null, dailyUsed: null } });
  });

  it("maps failure statuses through the shared taxonomy", async () => {
    stubAccount(null, null, 401);
    expect(await verifyKey(KEY)).toMatchObject({ ok: false, code: "invalid_key" });
    stubAccount(null, null, 429);
    expect(await verifyKey(KEY)).toMatchObject({ ok: false, code: "rate_limited" });
    stubAccount(null, null, 503);
    expect(await verifyKey(KEY)).toMatchObject({ ok: false, code: "unavailable" });
  });

  it("never leaks the key in the error message", async () => {
    stubAccount(null, null, 401);
    const result = await verifyKey("super-secret-vt-key");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).not.toContain("super-secret-vt-key");
  });
});

describe("provider definition", () => {
  it("rejects a public key when VirusTotal reports no privileged entitlement", async () => {
    stubAccount({ data: { attributes: { user_type: "public", privileges: {} } } }, {});
    const result = await virusTotalProvider.validate(KEY);
    expect(result).toMatchObject({ ok: false, code: "forbidden" });
    if (!result.ok) expect(result.message).toContain("cannot be connected to this commercial service");
  });

  it("marks commercial use available on a privileged key", async () => {
    stubAccount({ data: { attributes: { user_type: "premium", privileges: { intelligence: { granted: true } } } } }, {});
    const result = await virusTotalProvider.validate(KEY);
    if (result.ok) {
      expect(result.capabilities.find((capability) => capability.id === "commercial_licence")?.available).toBe(true);
    }
  });

  it("marks domain reputation unavailable once the daily allowance is spent", async () => {
    stubAccount(
      { data: { attributes: { user_type: "premium", privileges: { intelligence: { granted: true } } } } },
      { data: { api_requests_daily: { user: { allowed: 500, used: 500 } } } },
    );
    const result = await virusTotalProvider.validate(KEY);
    if (result.ok) {
      expect(result.capabilities.find((capability) => capability.id === "domain_reputation")?.available).toBe(false);
    }
  });
});
