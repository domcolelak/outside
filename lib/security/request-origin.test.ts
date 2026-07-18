import { describe, expect, it } from "vitest";
import { mutationOriginAllowed } from "./request-origin";

const request = (method: string, values: Record<string, string> = {}) => ({
  method,
  url: "https://outside.example/api/account",
  headers: { get: (name: string) => values[name.toLowerCase()] ?? null },
});

describe("mutation origin policy", () => {
  it("allows safe requests and same-origin browser mutations", () => {
    expect(mutationOriginAllowed(request("GET", { origin: "https://evil.example" }))).toBe(true);
    expect(
      mutationOriginAllowed(
        request("POST", { origin: "https://outside.example", "sec-fetch-site": "same-origin" }),
        "https://outside.example",
      ),
    ).toBe(true);
  });

  it("uses the configured public origin behind a reverse proxy", () => {
    const proxied = {
      ...request("POST", { origin: "https://outside.example:8443", "sec-fetch-site": "same-origin" }),
      url: "http://app:3000/api/account",
    };
    expect(mutationOriginAllowed(proxied, "https://outside.example:8443")).toBe(true);
    expect(mutationOriginAllowed(proxied, "https://different.example")).toBe(false);
  });

  it("allows the actual listener origin for direct and local release deployments", () => {
    const direct = {
      ...request("POST", { origin: "http://localhost:3000", "sec-fetch-site": "same-origin" }),
      url: "http://localhost:3000/api/account",
    };
    expect(mutationOriginAllowed(direct, "https://outside-ci.example")).toBe(true);
  });

  it("rejects cross-site and malformed browser origins", () => {
    expect(
      mutationOriginAllowed(
        request("POST", { origin: "https://evil.example" }),
        "https://outside.example",
      ),
    ).toBe(false);
    expect(mutationOriginAllowed(request("PATCH", { "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(mutationOriginAllowed(request("DELETE", { origin: "not a URL" }))).toBe(false);
  });

  it("allows signed non-browser integrations without browser origin headers", () => {
    expect(mutationOriginAllowed(request("POST"))).toBe(true);
  });
});
