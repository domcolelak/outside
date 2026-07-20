import { afterEach, describe, expect, it, vi } from "vitest";
import {
  discoverPassiveHostnames,
  normalizeSubdomains,
  passiveDnsEnabled,
  securityTrailsConfigured,
  shodanConfigured,
} from "./passive-dns";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("normalizeSubdomains", () => {
  it("builds FQDNs from bare prefixes under the target", () => {
    const out = normalizeSubdomains(["www", "api", "api.staging"], "acme.com");
    expect(out).toEqual(["www.acme.com", "api.acme.com", "api.staging.acme.com"]);
  });

  it("tolerates prefixes already carrying the domain and de-duplicates", () => {
    const out = normalizeSubdomains(["www", "www.acme.com", "WWW"], "acme.com");
    expect(out).toEqual(["www.acme.com"]);
  });

  it("rejects wildcards, spaces, non-strings and invalid labels", () => {
    expect(normalizeSubdomains(["*", "*.acme.com", "a b", 42, null], "acme.com")).toEqual([]);
    expect(normalizeSubdomains("not-an-array", "acme.com")).toEqual([]);
  });

  it("never accepts a host that is not under the registrable target", () => {
    // A provider trying to inject an unrelated host cannot escape the domain suffix.
    const out = normalizeSubdomains(["evil.attacker.com", "acme.com.evil.com"], "acme.com");
    expect(out.every((h) => h.endsWith(".acme.com"))).toBe(true);
    expect(out).not.toContain("evil.attacker.com");
  });

  it("resolves the registrable domain for a subdomain scan target", () => {
    const out = normalizeSubdomains(["vpn", "beta.app"], "shop.acme.com");
    expect(out).toEqual(["vpn.shop.acme.com", "beta.app.shop.acme.com"]);
  });
});

describe("passive-DNS configuration gating", () => {
  it("is disabled with no provider keys", () => {
    vi.unstubAllEnvs();
    expect(securityTrailsConfigured()).toBe(false);
    expect(shodanConfigured()).toBe(false);
    expect(passiveDnsEnabled()).toBe(false);
  });

  it("is enabled once any provider key is present", () => {
    vi.stubEnv("SHODAN_API_KEY", "k");
    expect(passiveDnsEnabled()).toBe(true);
  });
});

describe("discoverPassiveHostnames", () => {
  it("does nothing and calls no provider without keys", async () => {
    vi.unstubAllEnvs();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { hostnames, runs } = await discoverPassiveHostnames("acme.com");
    expect(hostnames).toEqual([]);
    expect(runs).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("merges hostnames from every configured provider with a ProviderRun each", async () => {
    vi.stubEnv("SECURITYTRAILS_API_KEY", "st");
    vi.stubEnv("SHODAN_API_KEY", "sh");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("securitytrails.com")) {
        return new Response(JSON.stringify({ subdomains: ["www", "api"] }), { status: 200 });
      }
      return new Response(JSON.stringify({ subdomains: ["api", "vpn"] }), { status: 200 });
    }));

    const { hostnames, runs } = await discoverPassiveHostnames("acme.com");
    expect(new Set(hostnames)).toEqual(new Set(["www.acme.com", "api.acme.com", "vpn.acme.com"]));
    expect(runs).toHaveLength(2);
    expect(runs.every((r) => r.status === "ok" && r.method === "passive_subdomain")).toBe(true);
  });

  it("isolates a provider failure into an error ProviderRun without failing the scan", async () => {
    vi.stubEnv("SECURITYTRAILS_API_KEY", "st");
    vi.stubEnv("SHODAN_API_KEY", "sh");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("securitytrails.com")) return new Response("nope", { status: 429 });
      return new Response(JSON.stringify({ subdomains: ["vpn"] }), { status: 200 });
    }));

    const { hostnames, runs } = await discoverPassiveHostnames("acme.com");
    expect(hostnames).toEqual(["vpn.acme.com"]);
    const failed = runs.find((r) => r.provider === "SecurityTrails");
    const ok = runs.find((r) => r.provider === "Shodan");
    expect(failed?.status).toBe("error");
    expect(failed?.errors[0]).toContain("429");
    expect(ok?.status).toBe("ok");
  });

  it("propagates caller abort rather than swallowing it", async () => {
    vi.stubEnv("SHODAN_API_KEY", "sh");
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new DOMException("aborted", "AbortError");
    }));
    await expect(discoverPassiveHostnames("acme.com", { signal: controller.signal })).rejects.toBeTruthy();
  });
});
