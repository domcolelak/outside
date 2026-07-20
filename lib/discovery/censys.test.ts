import { afterEach, describe, expect, it, vi } from "vitest";
import { censysConfigured, enrichCensysServices, lookupHostServices, parseServices } from "./censys";
import { generateExposedServiceFindings } from "@/lib/analysis/services";
import type { Asset } from "@/lib/types";

function host(id: string, addresses: string[]): Asset {
  return {
    id, kind: "web_service", label: `${id}.acme.com`, canonical: `${id}.acme.com`,
    firstObservedAt: "", lastObservedAt: "", discoveredVia: ["dns"], evidence: [],
    signals: [], priority: "info", orgConfidence: 1, attrs: { addresses },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const HOSTS_BODY = JSON.stringify({
  result: {
    services: [
      { port: 443, service_name: "HTTP", transport_protocol: "tcp" },
      { port: 22, extended_service_name: "SSH", transport_protocol: "tcp" },
      { port: 3306, service_name: "MYSQL", transport_protocol: "tcp" },
      { port: 3306, service_name: "MYSQL", transport_protocol: "tcp" }, // duplicate port
      { port: 70000, service_name: "BOGUS" }, // out of range, dropped
    ],
  },
});

describe("parseServices", () => {
  it("normalizes, de-duplicates by port, drops invalid ports, and sorts", () => {
    const svc = parseServices(JSON.parse(HOSTS_BODY));
    expect(svc.map((s) => s.port)).toEqual([22, 443, 3306]);
    expect(svc[0]).toMatchObject({ port: 22, name: "SSH", transport: "TCP" });
  });

  it("returns [] for malformed bodies", () => {
    expect(parseServices(null)).toEqual([]);
    expect(parseServices({ result: {} })).toEqual([]);
    expect(parseServices({ result: { services: "nope" } })).toEqual([]);
  });
});

describe("censys configuration + lookup gating", () => {
  it("is inactive unless BOTH id and secret are set", async () => {
    vi.unstubAllEnvs();
    expect(censysConfigured()).toBe(false);
    vi.stubEnv("CENSYS_API_ID", "id");
    expect(censysConfigured()).toBe(false);
    vi.stubEnv("CENSYS_API_SECRET", "secret");
    expect(censysConfigured()).toBe(true);
  });

  it("does not call the API and returns [] when unconfigured", async () => {
    vi.unstubAllEnvs();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await lookupHostServices("8.8.8.8")).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reads a 404 (unseen address) as no services", async () => {
    vi.stubEnv("CENSYS_API_ID", "id");
    vi.stubEnv("CENSYS_API_SECRET", "secret");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    expect(await lookupHostServices("8.8.8.8")).toEqual([]);
  });
});

describe("enrichCensysServices", () => {
  it("attaches observed services to assets and skips private IPs", async () => {
    vi.stubEnv("CENSYS_API_ID", "id");
    vi.stubEnv("CENSYS_API_SECRET", "secret");
    const fetchMock = vi.fn(async () => new Response(HOSTS_BODY, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const web = host("db", ["8.8.8.8"]);
    const internal = host("int", ["10.0.0.5"]);
    const runs = await enrichCensysServices([web, internal]);

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ provider: "Censys", method: "service_observation", status: "ok" });
    expect(web.attrs.exposedServices).toEqual(["22/TCP", "443/TCP", "3306/TCP"]);
    expect(internal.attrs.exposedServices).toBeUndefined();
    // private IP was never queried
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("isolates a failure into an error ProviderRun", async () => {
    vi.stubEnv("CENSYS_API_ID", "id");
    vi.stubEnv("CENSYS_API_SECRET", "secret");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 500 })));
    const runs = await enrichCensysServices([host("db", ["8.8.8.8"])]);
    expect(runs[0]!.status).toBe("partial");
    expect(runs[0]!.errors[0]).toContain("500");
  });
});

describe("generateExposedServiceFindings", () => {
  it("flags exposed datastores/admin and ignores web-only services", () => {
    const db = host("db", ["8.8.8.8"]);
    db.attrs.exposedServices = ["443/TCP", "3306/TCP", "22/TCP"];
    const findings = generateExposedServiceFindings([db], "now");
    expect(findings).toHaveLength(1);
    expect(findings[0]!.category).toBe("exposed-service");
    expect(findings[0]!.priority).toBe("high"); // MySQL present
    expect(findings[0]!.observation).toContain("3306");
    expect(findings[0]!.observation).not.toContain("443");
    expect(findings[0]!.concern).toMatch(/not a confirmed breach/i);
  });

  it("produces nothing for web-only exposure or no enrichment", () => {
    const webOnly = host("www", ["8.8.8.8"]);
    webOnly.attrs.exposedServices = ["443/TCP", "80/TCP"];
    expect(generateExposedServiceFindings([webOnly], "now")).toEqual([]);
    expect(generateExposedServiceFindings([host("bare", ["8.8.8.8"])], "now")).toEqual([]);
  });

  it("uses medium priority when only remote-access services are exposed", () => {
    const ssh = host("bastion", ["8.8.8.8"]);
    ssh.attrs.exposedServices = ["22/TCP", "21/TCP"];
    const findings = generateExposedServiceFindings([ssh], "now");
    expect(findings[0]!.priority).toBe("medium");
    expect(findings[0]!.title).toContain("administrative service");
  });
});
