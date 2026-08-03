import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyKey as shodanVerify, looksLikeShodanKey } from "@/lib/integrations/shodan";
import { verifyKey as abuseVerify, looksLikeAbuseIpdbKey } from "@/lib/integrations/abuseipdb";
import { verifyKey as greyVerify, looksLikeGreyNoiseKey } from "@/lib/integrations/greynoise";
import { listProviders, getProvider, listByokDescriptors } from "./registry";
import { abuseIpdbProvider } from "./abuseipdb";
import { shodanProvider } from "./shodan";

afterEach(() => vi.restoreAllMocks());

function stub(status: number, body: unknown, headers: Record<string, string> = {}) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body === null ? "" : JSON.stringify(body), { status, headers })));
}

describe("key format checks", () => {
  it("accepts real shapes and rejects rubbish", () => {
    expect(looksLikeShodanKey("a".repeat(32))).toBe(true);
    expect(looksLikeShodanKey("a".repeat(31))).toBe(false);
    expect(looksLikeAbuseIpdbKey("f".repeat(80))).toBe(true);
    expect(looksLikeAbuseIpdbKey("f".repeat(79))).toBe(false);
    expect(looksLikeGreyNoiseKey("gn-key_abcdef123456")).toBe(true);
    expect(looksLikeGreyNoiseKey("short")).toBe(false);
  });
});

describe("Shodan adapter", () => {
  it("reads the plan and credits, and sends the key as a query parameter", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ plan: "dev", query_credits: 100, scan_credits: 10 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await shodanVerify("k".repeat(32));
    expect(result).toMatchObject({ ok: true, plan: { plan: "dev", queryCredits: 100 } });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("key=");
  });

  it("maps failure statuses through the shared taxonomy", async () => {
    stub(401, null); expect(await shodanVerify("k")).toMatchObject({ ok: false, code: "invalid_key" });
    stub(429, null, { "retry-after": "30" }); expect(await shodanVerify("k")).toMatchObject({ ok: false, code: "rate_limited", retryAfterSeconds: 30 });
    stub(503, null); expect(await shodanVerify("k")).toMatchObject({ ok: false, code: "unavailable" });
  });

  it("never leaks the key in the error message", async () => {
    stub(401, null);
    const result = await shodanVerify("super-secret-shodan-key");
    if (!result.ok) expect(result.message).not.toContain("super-secret-shodan-key");
  });

  it("rejects academic and research plans in the commercial connector", async () => {
    stub(200, { plan: "academic", query_credits: 100, scan_credits: 10 });
    expect(await shodanProvider.validate("k")).toMatchObject({ ok: false, code: "forbidden" });
  });
});

describe("AbuseIPDB adapter", () => {
  it("reports the remaining daily allowance from the rate-limit headers", async () => {
    const fetchMock = vi.fn(async (_u: string, init?: RequestInit) => {
      expect(((init?.headers ?? {}) as Record<string, string>).Key).toBe("abuse-key");
      return new Response(JSON.stringify({ data: {} }), { status: 200, headers: { "x-ratelimit-remaining": "993", "x-ratelimit-limit": "1000" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await abuseVerify("abuse-key")).toMatchObject({ ok: true, quota: { remaining: 993, limit: 1000 } });
  });

  it("tolerates a response without quota headers", async () => {
    stub(200, { data: {} });
    expect(await abuseVerify("k")).toMatchObject({ ok: true, quota: { remaining: null, limit: null } });
  });

  it("maps an invalid key", async () => {
    stub(401, null);
    expect(await abuseVerify("k")).toMatchObject({ ok: false, code: "invalid_key" });
  });

  it("rejects a Free/Individual key for commercial use", async () => {
    stub(200, { data: {} }, { "x-ratelimit-remaining": "993", "x-ratelimit-limit": "1000" });
    expect(await abuseIpdbProvider.validate("k")).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("accepts a Basic-or-higher paid-plan limit", async () => {
    stub(200, { data: {} }, { "x-ratelimit-remaining": "9993", "x-ratelimit-limit": "10000" });
    expect(await abuseIpdbProvider.validate("k")).toMatchObject({ ok: true, accountLabel: "10000 checks/day" });
  });

  it("fails closed when the commercial plan cannot be established", async () => {
    stub(200, { data: {} });
    expect(await abuseIpdbProvider.validate("k")).toMatchObject({ ok: false, code: "forbidden" });
  });
});

describe("GreyNoise adapter", () => {
  it("treats an unobserved probe IP (404) as a successful authentication", async () => {
    stub(404, null);
    expect(await greyVerify("k")).toMatchObject({ ok: true });
  });

  it("succeeds on a normal 200 and sends the key header", async () => {
    const fetchMock = vi.fn(async (_u: string, init?: RequestInit) => {
      expect(((init?.headers ?? {}) as Record<string, string>).key).toBe("gn-key");
      return new Response(JSON.stringify({ classification: "benign" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await greyVerify("gn-key")).toMatchObject({ ok: true });
  });

  it("maps an invalid key", async () => {
    stub(401, null);
    expect(await greyVerify("k")).toMatchObject({ ok: false, code: "invalid_key" });
  });
});

describe("provider registry invariants", () => {
  it("every registered provider is offered in the UI", () => {
    // A provider that is routable but never rendered is connectable only by
    // hand-crafting a request — which is how Censys shipped invisible once.
    expect(listByokDescriptors().map((d) => d.id).sort()).toEqual(listProviders().map((p) => p.id).sort());
  });

  it("carries the credential kind through to the connector", () => {
    const censys = listByokDescriptors().find((d) => d.id === "censys");
    expect(censys?.credentialKind).toBe("id_secret");
  });

  it("every provider is reachable by its own id", () => {
    for (const provider of listProviders()) {
      expect(getProvider(provider.id)?.id).toBe(provider.id);
    }
  });

  it("no two providers share an env key or a scan run label", () => {
    const providers = listProviders();
    expect(new Set(providers.map((p) => p.envKey)).size).toBe(providers.length);
    expect(new Set(providers.map((p) => p.runLabel)).size).toBe(providers.length);
  });

  it("every provider declares the fields the shared framework depends on", () => {
    for (const provider of listProviders()) {
      expect(provider.envKey).toMatch(/^[A-Z0-9_]+$/);
      expect(provider.runLabel.length).toBeGreaterThan(0);
      expect(provider.docsUrl).toMatch(/^https:\/\//);
      expect(typeof provider.looksValid).toBe("function");
      expect(typeof provider.validate).toBe("function");
    }
  });
});
