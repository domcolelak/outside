import { describe, expect, it } from "vitest";

import { GET } from "@/app/.well-known/security.txt/route";
import { SECURITY_BODY } from "./security";

/**
 * security.txt is how a researcher finds out where to send something before
 * they post it publicly, so the fields the RFC makes mandatory are worth
 * asserting rather than assuming.
 */
describe("security.txt", () => {
  async function body(): Promise<string> {
    return await (await GET()).text();
  }

  it("serves plain text with the mandatory fields", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");

    const text = await response.text();
    expect(text).toContain("Contact: mailto:security@outsideguardian.eu");
    expect(text).toMatch(/^Expires: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/m);
  });

  it("expires within the year the RFC recommends", async () => {
    // A hard-coded date is the usual way this file rots. Computing it means the
    // served copy is always valid; the test guards the arithmetic.
    const expires = (await body()).match(/^Expires: (.+)$/m)?.[1];
    const ahead = new Date(expires!).getTime() - Date.now();
    expect(ahead).toBeGreaterThan(0);
    expect(ahead).toBeLessThanOrEqual(367 * 24 * 60 * 60 * 1000);
  });

  it("points at the published policy with absolute URLs", async () => {
    // Relative URLs are invalid here: the file is fetched by tools that have
    // no page context to resolve them against.
    const text = await body();
    for (const field of ["Policy", "Canonical"]) {
      const value = text.match(new RegExp(`^${field}: (.+)$`, "m"))?.[1];
      expect(value, `${field} is missing`).toBeTruthy();
      expect(() => new URL(value!), `${field} is not absolute`).not.toThrow();
    }
  });

  it("names the address the policy page publishes", async () => {
    // Two copies of the same address; if they drift, one set of reporters is
    // writing to a mailbox nobody reads.
    expect(SECURITY_BODY).toContain("security@outsideguardian.eu");
  });

  it("offers only the languages the product is actually written in", async () => {
    const languages = (await body()).match(/^Preferred-Languages: (.+)$/m)?.[1];
    expect(languages?.split(",").map((code) => code.trim()).sort()).toEqual(["cs", "en", "hu", "pl", "sk"]);
  });
});
