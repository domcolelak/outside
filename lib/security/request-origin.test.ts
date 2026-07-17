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
    expect(mutationOriginAllowed(request("POST", { origin: "https://outside.example", "sec-fetch-site": "same-origin" }))).toBe(true);
  });

  it("rejects cross-site and malformed browser origins", () => {
    expect(mutationOriginAllowed(request("POST", { origin: "https://evil.example" }))).toBe(false);
    expect(mutationOriginAllowed(request("PATCH", { "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(mutationOriginAllowed(request("DELETE", { origin: "not a URL" }))).toBe(false);
  });

  it("allows signed non-browser integrations without browser origin headers", () => {
    expect(mutationOriginAllowed(request("POST"))).toBe(true);
  });
});
