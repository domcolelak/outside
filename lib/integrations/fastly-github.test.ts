import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyKey as fastlyVerify, ownedDomains as fastlyDomains, looksLikeFastlyToken } from "./fastly";
import { verifyKey as ghVerify, ownedDomains as ghDomains, looksLikeGitHubToken } from "./github";

afterEach(() => vi.restoreAllMocks());

/** Route a call by URL so the multi-step walks can be exercised. */
function routes(map: Array<[RegExp, unknown, number?]>) {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    for (const [pattern, body, status] of map) {
      if (pattern.test(String(url))) return new Response(body === null ? "" : JSON.stringify(body), { status: status ?? 200 });
    }
    return new Response("", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("token formats", () => {
  it("accept plausible tokens and reject rubbish", () => {
    expect(looksLikeFastlyToken("a".repeat(32))).toBe(true);
    expect(looksLikeFastlyToken("short")).toBe(false);
    expect(looksLikeGitHubToken("ghp_" + "a".repeat(36))).toBe(true);
    expect(looksLikeGitHubToken("has spaces in it here")).toBe(false);
  });
});

describe("Fastly", () => {
  it("sends the token in the Fastly-Key header", async () => {
    const fetchMock = routes([[/current_user/, { login: "acme-ops" }]]);
    expect(await fastlyVerify("t".repeat(30))).toMatchObject({ ok: true, account: "acme-ops" });
    const headers = (fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.headers as Record<string, string>;
    expect(headers["fastly-key"]).toBe("t".repeat(30));
  });

  it("collects domains from each service's ACTIVE version only", async () => {
    // Serving state lives on the active version; an older version's domains are
    // not what the internet currently resolves to.
    routes([
      [/\/service$/, [{ id: "svc1", versions: [{ number: 1, active: false }, { number: 2, active: true }] }]],
      [/\/service\/svc1\/version\/2\/domain/, [{ name: "www.acme.com" }, { name: "cdn.acme.com" }]],
      [/\/service\/svc1\/version\/1\/domain/, [{ name: "stale.acme.com" }]],
    ]);
    const result = await fastlyDomains("t".repeat(30));
    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.domains.sort()).toEqual(["cdn.acme.com", "www.acme.com"]);
      expect(result.domains).not.toContain("stale.acme.com");
    }
  });

  it("skips a service with no active version rather than failing the walk", async () => {
    routes([
      [/\/service$/, [{ id: "svc1", versions: [{ number: 1, active: false }] }, { id: "svc2", versions: [{ number: 3, active: true }] }]],
      [/\/service\/svc2\/version\/3\/domain/, [{ name: "live.acme.com" }]],
    ]);
    expect(await fastlyDomains("t".repeat(30))).toMatchObject({ ok: true, domains: ["live.acme.com"] });
  });

  it("reports a rejected token instead of an empty domain list", async () => {
    routes([[/\/service$/, null, 401]]);
    expect(await fastlyDomains("t".repeat(30))).toMatchObject({ ok: false, code: "invalid_key" });
  });
});

describe("GitHub", () => {
  it("sends a user agent, which GitHub requires", async () => {
    const fetchMock = routes([[/\/user$/, { login: "acme" }]]);
    expect(await ghVerify("g".repeat(30))).toMatchObject({ ok: true, account: "acme" });
    const headers = (fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.headers as Record<string, string>;
    expect(headers["user-agent"]).toBeTruthy();
  });

  it("returns only Pages sites that have a custom domain", async () => {
    routes([
      [/\/user\/repos/, [
        { full_name: "acme/site", has_pages: true },
        { full_name: "acme/lib", has_pages: false },
        { full_name: "acme/docs", has_pages: true },
      ]],
      [/\/repos\/acme\/site\/pages/, { cname: "www.acme.com" }],
      // A Pages site on the default github.io host has no cname and owns no domain.
      [/\/repos\/acme\/docs\/pages/, { cname: null }],
    ]);
    expect(await ghDomains("g".repeat(30))).toMatchObject({ ok: true, domains: ["www.acme.com"] });
  });

  it("never queries Pages for a repository that has none", async () => {
    const fetchMock = routes([[/\/user\/repos/, [{ full_name: "acme/lib", has_pages: false }]]]);
    await ghDomains("g".repeat(30));
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("/pages"))).toBe(false);
  });

  it("reports a rejected token instead of an empty domain list", async () => {
    routes([[/\/user\/repos/, null, 401]]);
    expect(await ghDomains("g".repeat(30))).toMatchObject({ ok: false, code: "invalid_key" });
  });
});
